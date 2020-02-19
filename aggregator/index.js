const restify = require('restify');
const nsq = require('nsqjs');
const _ = require('lodash');

const logger = require('./logger');
const request = require('../shared/request');
const { sleep } = require('../shared/utilities');

const state = {
  writerReady: false,
  readerReady: false,
};

const reader = new nsq.Reader('data', 'progressed', {
  lookupdHTTPAddresses: 'nsqlookupd:4161',
});

reader.connect();
const writer = new nsq.Writer('nsqd', 4150);

const handleReadyState = (type) => {
  logger.info(`${type} ready`);
  state[`${type}Ready`] = true;
};

writer.on('ready', () => handleReadyState('writer'));
reader.on('ready', () => handleReadyState('reader'));

reader.on('message', (msg) => {
  console.log('Received message [%s]: %s', msg.id, msg.body.toString());
  msg.finish();
});

const server = restify.createServer();

server.get('/data', (req, res) => {
  const body = req.body || request.dataRequestGenerator(0, false, 10, 10);
  const { id, invalidData, temperature, humidity } = body;

  logger.info(`data from device: ${id} | invalid: ${invalidData} | temp: ${temperature} | humidity ${humidity}`);
  if (state.writerReady) writer.publish('progressing', req.body || { sample: 101, example: 'hello' });

  return res.send();
});

server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));

async function setup() {
  logger.info('setting up aggregator');
  reader.connect();
}

setup();
