const nsq = require('nsqjs');
const _ = require('lodash');

const logger = require('./logger');
const { sleep } = require('../shared/utilities');

const state = {
  writerReady: false,
  readerReady: false,
  reader: null,
  writer: null,
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
  logger.info('Received message [%s]: %s', message.id, message.body.toString());
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

  state.reader.connect();
  state.writer.connect();
}

setup();
