const nsq = require('nsqjs');
const _ = require('lodash');

const logger = require('./logger');
const { sleep } = require('../shared/utilities');

const state = {
  writerReady: false,
  readerReady: false,
  reader: null,
  writer: null,

  zonesDataHistory: 30,
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
      temperature: { min: 40, max: 55 },
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
 * @param {string} message The message that was sent to the by the reader.
 */
function handleReaderMessage(message) {
  const { id, zone, section, temperature, invalid, type } = JSON.parse(message.body.toString());

  const temp = JSON.stringify(temperature);
  const location = section - 1;

  logger.info(
    `pre-validation data from device: ${id}, zone: ${zone}, section: ${section}, invalid: ${invalid}, type: ${type}, temp: ${temp}`
  );
  logger.info();

  zones.data[location].push(temperature.temperature);
  if (zones.data[location].length > state.zonesDataHistory) {
    zones.data[location].shift();
  }

  logger.info(`${JSON.stringify(zones.data)} - \n AMOUNT: ${_.sum(_.map(zones.data, (x) => x.length))}`);

  if (state.writerReady) state.writer.publish('sensor-data', message.body);
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
  logger.info('generating index array');

  // setup the data arrays that will contain all the history of all the sensor data. since if we
  // allocate all the space before hand to help with simplifying allocation of space.
  for (let index = 0; index < 36; index++) {
    zones.data.push([]);
  }

  state.reader.connect();
  state.writer.connect();
}

setup();
