import * as fs from 'fs';
import { isNil } from 'lodash';

const configFile: any = JSON.parse(fs.readFileSync('./ormconfig.json').toString());

const DIALECT: any = process.env.DIALECT || 'postgres';
const environment = process.env.NODE_ENV;

const {
  password, host, database, port, username, synchronize, logging,
} = configFile;

const TEST_CONFIGURATION = {
  HOST: host,
  PORT: port,
  NAME: database,
  USER: username,
  PASS: password,
  SYNC: synchronize,
  LOG: logging,
};

const MASTER_CONFIGURATION = {
  HOST: host,
  PORT: port,
  NAME: database,
  USER: username,
  PASS: password,
  SYNC: synchronize,
  LOG: logging,
};

const config = {
  DATABASE: !isNil(environment) && environment === 'test' ? TEST_CONFIGURATION : MASTER_CONFIGURATION,
  PORT_APP: Number(process.env.APP_PORT),
};

export { DIALECT, config };
