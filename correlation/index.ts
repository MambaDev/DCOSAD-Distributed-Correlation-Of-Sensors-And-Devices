import * as nsq from 'nsqjs';
import * as _ from 'lodash';

import 'reflect-metadata';
import logger from './logger';
import { Connection, ConnectToDatabase } from './connection';
import { getRepository } from 'typeorm';
import { DeviceEntry } from './entity/device.model';

const { sleep } = require('../shared/utilities');


const state = {
  writerReady: false,
  readerReady: false,
  reader: null,
  writer: null,

  zonesDataHistory: 50,

  correlationFailedTypes: {
    NOT_WITHIN_ZONE_SECTION: 'NOT_WITHIN_ZONE_SECTION',
    NOT_WITHIN_ZONE: 'NOT_WITHIN_ZONE',
    WITHIN_BOUNDING_ZONES: 'WITHIN_BOUNDING_ZONES',
  },
};

// ###################################
// # Registration and Zone Assignment
// ###################################

const zones = {
  data: [],

  info: [
    {
      id: 1,
      temperature: { min: 50, max: 60 },
      sections: { min: 1, max: 4, allocations: [] },
    },
    {
      id: 2,
      temperature: { min: 40, max: 50 },
      sections: { min: 5, max: 16, allocations: [] },
    },
    {
      id: 3,
      temperature: { min: 20, max: 40 },
      sections: { min: 17, max: 36, allocations: [] },
    },
  ],
};

// ###################################
// # Correlation Check
// ###################################

/**
 * Checks to see that within the bounds of its own section within its zone that its within the percentage required to be
 * classed as valid reporting data, if not then the device should be serviced and checked.
 *
 * @param {object} data The data produced by the device.
 */
function withinZoneSectionData(data): { passed: boolean, percentage: number } {
  const { id, zone, section, temperature, invalid, type } = data;
  const zoneRangeData = [];

  for (let i = zones.info[zone - 1].sections.min - 1; i < zones.info[zone - 1].sections.max; i++) {
    if (zones.data[i].length === 0) continue;

    zoneRangeData.push(_.sum(_.map(zones.data[i], (e) => e.temperature)) / zones.data[i].length);
  }

  if (zoneRangeData.length == 0) return { passed: true, percentage: 0 };

  const average = _.sum(zoneRangeData) / zoneRangeData.length;
  const percentage = Math.abs((temperature.temperature / average - 1) * 100);

  logger.info({ len: zoneRangeData.length,  average, temp: temperature.temperature, percentage });

  if (zoneRangeData.length === 0) return { passed: true, percentage: 0 };
  return { passed: percentage <= 15, percentage };
}

/**
 * Checks to see that within the bounds of its own zone + sections that its within the percentage required to be
 * classed as valid reporting data, if not then the device should be serviced and checked.
 *
 * @param {object} data The data produced by the device.
 */
function withinZoneAndSectionData(data): { passed: boolean, percentage: number } {
  const { id, zone, section, temperature, invalid, type } = data;

  const zoneData = zones.data[data.section - 1];
  if (zoneData.length == 0) return { passed: true, percentage: 0 };

  const average = _.sum(_.map(zoneData, (e) => e.temperature)) / zoneData.length;

  const percentage = Math.abs((temperature.temperature / average - 1) * 100);
  return { passed: percentage <= 12.5, percentage };
}

/**
 * Checks to see that within the bounds of its own bounding zones + sections that its within the percentage required to be
 * classed as valid reporting data within its related zone, if its closer to the bounding zones than its actual zone then
 * its either in the wrong zone or reporting bad data, both cases should be checked.
 *
 * @param {object} data The data produced by the device.
 */
function notWithinBoundsOfTouchingZones(data): { passed: boolean, percentage: number } {
  const { id, zone, section, temperature, invalid, type } = data;
  return { passed: true, percentage: 0 };
}

function performCorrelationCheck(data): { reason: any, failed: boolean, percentage: number } {
  const failedCorrelation = { reason: null, failed: false, percentage: 0 };


  if (!failedCorrelation.failed) {
    const outputCheck = notWithinBoundsOfTouchingZones(data);

    if (!outputCheck.passed) {
      failedCorrelation.reason = state.correlationFailedTypes.WITHIN_BOUNDING_ZONES;
      failedCorrelation.percentage = outputCheck.percentage;
      failedCorrelation.failed = true;
    }
  }

  if (!failedCorrelation.failed) {
    const outputCheck = withinZoneSectionData(data);

    if (!outputCheck.passed) {
      failedCorrelation.reason = state.correlationFailedTypes.NOT_WITHIN_ZONE;
      failedCorrelation.percentage = outputCheck.percentage;
      failedCorrelation.failed = true;
    }
  }

  // if we are not invalid don't bother
  if (!failedCorrelation.failed) {
    const outputCheck = withinZoneAndSectionData(data);

    if (!outputCheck.passed) {
      failedCorrelation.reason = state.correlationFailedTypes.NOT_WITHIN_ZONE_SECTION;
      failedCorrelation.percentage = outputCheck.percentage;
      failedCorrelation.failed = true;
    }
  }

  // write it into the database with the expanded data, reason caught, and related data.
  if (failedCorrelation.failed) {
    return failedCorrelation;
  }

  // if the given data was invalid and it was not caught by the correlation service, then
  // we must also store this kind of information, so that we know what type is not being
  // caught and any additional data that could be used to understand why.
  if (!failedCorrelation.failed && data.invalid) {
    return failedCorrelation;
  }

  // it was not caught and it was not a invalid type.
  return failedCorrelation;
}

// ###################################
// # NSQ
// ###################################

/**
 * Marks a handler (reader, writer) as ready in the system and logs that its ready.
 * @param {string} type The type of nsq handler that is ready.
 */
function handleReadyState(type) {
  logger.info(`${type} ready`);
  state[`${type}Ready`] = true;
}

/**
 * Progresses new messages received by the reader.
 * @param {object} The message that was sent to the by the reader.
 */
async function handleReaderMessage(message) {
  const { id, zone, section, temperature: temp, invalid, type } = JSON.parse(message.body.toString());
  const location = section - 1;

  // const logMessage =
  //   `pre-validation - for ${id} zone: ${zone}, section: ${section}, invalid: ` +
  //   `${invalid}, type: ${type}, temperature: ${temp.temperature}, humidity: ${temp.humidity}`;

  const zoneAmount = _.sum(_.map(zones.data, (x) => x.length));

  // if the data failed the validation process or it was a invalid data type, then don't bother processing the data
  // more and let the logger know that one was caught. This should return false always if the data was caught or invalid.
  // since this is a perfect case and we don't want bad data actually tainting the experiment.
  if (zoneAmount >= state.zonesDataHistory * 1 || invalid) {
    const correlationCheck = performCorrelationCheck(JSON.parse(message.body));

    // if it did not fail, then don't handle it as if it fails.
    if (correlationCheck.failed) {
      const logMessage =
        `validation correlation - failed for ${id} - zone: ${zone}, section: ${section}, invalid: ` +
        `${invalid}, type: ${type}, reason: ${correlationCheck.reason}, percentage: ${correlationCheck.percentage}, temperature: ${temp.temperature}, humidity: ${temp.humidity}`;

      const deviceEntry = new DeviceEntry(id, zone, section, type, invalid, correlationCheck.reason,
        correlationCheck.percentage, temp.temperature, temp.humidity);

      // logger.info(logMessage);

      // insert the flagged as failed entry into the database.
      await getRepository(DeviceEntry).insert(deviceEntry);

      return message.finish();
    }
  }

  zones.data[location].push(temp);
  if (zones.data[location].length > state.zonesDataHistory) {
    zones.data[location].shift();
  }

  state.writer.publish('sensor-data', message.body);
  message.finish();
}

/**
 * Fired when a error happened on the nsq.
 * @param {Error} error The error that occurred when connecting.
 */
function handleReaderError(error) {
  logger.error(`error occurred: ${error}`);
}

// ###################################
// # Setup
// ###################################

state.writer = new nsq.Writer('nsqd', 4150);
state.reader = new nsq.Reader('raw-sensor-data', 'preprogressing', {
  lookupdHTTPAddresses: 'nsqlookupd:4161',
  maxInFlight: 5,
});

/**
 * Handles the ready state handlers for the reader and the writer, allows the setup and trigger of
 * internal trackers to know if and when the handlers are ready for action.
 */
state.writer.on('ready', () => handleReadyState('writer'));
state.reader.on('nsqd_connected', () => handleReadyState('reader'));

state.reader.on('message', handleReaderMessage);
state.reader.on('error', handleReaderError);

async function setup() {
  await sleep(1000);
  logger.info('setting up aggregator');

  logger.info('connecting to the database');
  await ConnectToDatabase(Connection);

  logger.info('generating index array');
  // setup the data arrays that will contain all the history of all the sensor data. since if we
  // allocate all the space before hand to help with simplifying allocation of space.
  for (let index = 0; index < 36; index++) {
    zones.data.push([]);
  }


  state.reader.connect();
  state.writer.connect();
}

setup().catch((error) => {
  logger.error(error.message);
});
