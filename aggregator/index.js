const restify = require('restify');
const nsq = require('nsqjs');
const _ = require('lodash');
const { v4: uuid } = require('uuid');

const logger = require('./logger');
const { sleep } = require('../shared/utilities');

const state = {
  writerReady: false,
  readerReady: false,
  reader: null,
  writer: null,
};

// ###################################
// # Registration and Zone Assignment
// ###################################

const zones = {
  allocatedCount: 0,
  maxSection: 36,
  data: [
    {
      id: 1,
      temperature: { min: 50, max: 60 },
      sections: { min: 1, max: 4, allocations: [] },
      amount: 0,
    },
    {
      id: 2,
      temperature: { min: 40, max: 55 },
      sections: { min: 5, max: 16, allocations: [] },
      amount: 0,
    },
    {
      id: 3,
      temperature: { min: 20, max: 40 },
      sections: { min: 17, max: 36, allocations: [] },
      amount: 0,
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
  const { id, zone, section, temperature } = JSON.parse(message.body.toString());

  const temp = JSON.stringify(temperature);

  logger.info(`Validated data from device: ${id}, zone: ${zone}, section: ${section}, temp: ${temp}`);
  message.finish();
}

/**
 * Fired when a error happened on the nsq.
 * @param {Error} error The error that occurred when connecting.
 */
function handleReaderError(error) {
  logger.error(`error occurred: ${error}`);
  state.readerReady = false;
}

// ###################################
// # Restify
// ###################################

const server = restify.createServer();

server.get('/data', (req, res) => res.json(zones));

server.post('/data', (req, res) => {
  const { id, zone, section, invalid, temperature, humidity } = req.body;
  if (_.isNil(id) || _.isNil(zone)) return res.send();

  if (state.writerReady) state.writer.publish('raw-sensor-data', req.body);

  const alloc = zones.data[zone - 1].sections.allocations.filter((e) => e.id === id)[0];

  if (_.isNil(alloc)) zones.data[zone - 1].sections.allocations.push({ id, section, lastSeen: new Date() });
  if (!_.isNil(alloc)) alloc.lastSeen = new Date();

  return res.send();
});

server.get('/register', (req, res) => {
  const spaces = zones.data;

  const sectionAllocation = (zones.allocatedCount % zones.maxSection) + 1;
  const zone = _.filter(spaces, (x) => x.sections.min <= sectionAllocation && x.sections.max >= sectionAllocation)[0];

  const deviceId = uuid();
  const deviceAllocation = { id: deviceId, section: sectionAllocation, lastSeen: new Date() };
  zone.sections.allocations.push(deviceAllocation);

  zone.amount += 1;
  zones.allocatedCount += 1;

  logger.info(`registered device: ${deviceId}, zone: ${zone.id}, section: ${sectionAllocation}`);

  return res.json({
    id: deviceId,
    zone: { id: zone.id, section: sectionAllocation, temperature: zone.temperature },
  });
});

server.use(restify.plugins.bodyParser());
server.use(restify.plugins.queryParser());

server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));

// ###################################
// # cleanup
// ###################################

// after every 5 seconds, check that for every single registered device, that the device
// that is being reported is not out of scope by 10 seconds (e.g its no longer reporting)
// any data within 10 seconds. This will help with the experiment data being clean.
state.cleanupInterval = setInterval(() => {
  for (const zone of zones.data) {
    const currentTime = new Date();

    const filtered = zone.sections.allocations.filter((e) => (currentTime - e.lastSeen) / 1000 < 10);

    zone.sections.allocations = filtered;
    zone.amount = filtered.length;
  }

  zones.allocatedCount = _.sum(zones.data.map((e) => e.amount));
}, 5000);

// ###################################
// # Setup
// ###################################

state.writer = new nsq.Writer('nsqd', 4150);
state.reader = new nsq.Reader('sensor-data', 'progressed-ready', {
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
  logger.info('setting up aggregator - 1.0.0');

  state.reader.connect();
  state.writer.connect();
}

setup();
