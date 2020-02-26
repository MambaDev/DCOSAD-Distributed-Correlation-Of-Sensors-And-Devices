const fetch = require('node-fetch');
const _ = require('lodash');

const logger = require('./logger');
const { sleep } = require('../shared/utilities');

const state = {
  allocation: {},
  reportingInterval: null,
  reportingFalseData: false,
  falseReportingPercent: 0.1,
  falseReportingType: 'REAL',

  everyOtherToggle: false,

  upperShift: 1.4,
  lowerShift: 0.6,

  falseReportingPercentage: 5, // 5%
  dataProducedCount: 0, // the amount of data produced.

  falseReportingTypes: {
    DEAD: 'DEAD',
    TOO_LOW: 'TOO_LOW',
    TOO_HIGH: 'TOO_HIGH',
    FLUX: 'FLUX',
    EVERY_OTHER: 'EVERY_OTHER',
  },
};

// ###################################
// # Data Generation
// ###################################

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function generateReportingDataStandard(zone) {
  const { min, max } = zone.temperature;

  const temperature = Number(getRandomArbitrary(min, max).toFixed(2));
  const humidity = Number(getRandomArbitrary(min + 5, max + 5).toFixed(2));

  return { temperature: { temperature, humidity } };
}

function generateTooHighData(zone) {
  const { min, max } = zone.temperature;
  const shift = state.upperShift;

  const temperature = Number(getRandomArbitrary(min * shift, max * shift).toFixed(2));
  const humidity = Number(getRandomArbitrary((min + 5) * shift, (max + 5) * shift).toFixed(2));

  return { temperature: { temperature, humidity } };
}

function generateTooLowerData(zone) {
  const { min, max } = zone.temperature;
  const shift = state.lowerShift;

  const temperature = Number(getRandomArbitrary(min * shift, max * shift).toFixed(2));
  const humidity = Number(getRandomArbitrary((min + 5) * shift, (max + 5) * shift).toFixed(2));

  return { temperature: { temperature, humidity } };
}

function generateDeadData(zone) {
  return { temperature: { temperature: 0, humidity: 0 } };
}

function generateFakeReportingData(zone) {
  switch (state.falseReportingType) {
    case state.falseReportingTypes.TOO_LOW:
      // always reporting 40% less than the expected result, so that the result is always reporting
      // lower than it should be.
      return generateTooLowerData(zone);

    case state.falseReportingTypes.TOO_HIGH:
      // always reporting 40% higher than the expected result, so that the result is always
      // reporting higher than it should be.
      return generateTooHighData(zone);

    case state.falseReportingTypes.FLUX:
      // when in flux mode, based on a coin flip, the result will be responding with either too low
      // or too high based on the flip.
      return getRandomArbitrary(1, 2) == 1 ? generateTooLowerData(zone) : generateTooHighData(zone);

    case state.falseReportingTypes.EVERY_OTHER:
      // When every other mode is being used for the specified device, the device will return a
      // random data within the range in one case but in the every other case, zero will be
      // returned.
      state.everyOtherToggle = !state.everyOtherToggle;
      return state.everyOtherToggle ? generateDeadData(zone) : generateReportingDataStandard(zone);

    case state.falseReportingTypes.DEAD:
      // Act as if the device was reporting as dead, e.g all results regardless if what device is
      // reporting back as zero.
      return generateDeadData(zone);

    default:
      return generateReportingDataStandard(zone);
  }
}

function generateReportingData() {
  const zone = state.allocation.zone;

  // determine if we should be switching to fake data now or not.
  // and if we are, what mode are we going to be operating in.
  if (
    !state.reportingFalseData &&
    state.dataProducedCount > 10 &&
    getRandomArbitrary(1, 100) <= state.falseReportingPercentage
  ) {
    state.falseReportingType = _.sample(state.falseReportingTypes);
    state.reportingFalseData = true;

    logger.info(
      `device ${state.allocation.id} now in fault state: ${state.falseReportingType} - count: ${state.dataProducedCount}`
    );
  }

  const data = state.reportingFalseData
    ? generateFakeReportingData(state.allocation.zone)
    : generateReportingDataStandard(state.allocation.zone);

  state.dataProducedCount += 1;

  return {
    ...data,
    zone: zone.id,
    section: zone.section,
    id: state.allocation.id,
    invalid: state.reportingFalseData,
    type: state.falseReportingType,
  };
}

async function sendReportingData() {
  try {
    const data = generateReportingData();

    await fetch('http://aggregator:8080/data', {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'post',
    });
  } catch (error) {
    logger.error(`${state.allocation.id}: error occurred reporting data: ${error}`);
  }
}

// ###################################
// # Setup
// ###################################

async function setup() {
  await sleep(1000);
  logger.info(`setting up device 1.0.0`);

  const result = await fetch('http://aggregator:8080/register');
  state.allocation = await result.json();

  const deviceId = state.allocation.id;
  const zone = state.allocation.zone;
  const temp = zone.temperature;

  logger.info(`allocated id: ${deviceId}, zone: ${zone.id}, section: ${zone.section}, range: ${temp.min}-${temp.max}`);
  state.reportingInterval = setInterval(async () => sendReportingData(), 2500);
}

setup();
