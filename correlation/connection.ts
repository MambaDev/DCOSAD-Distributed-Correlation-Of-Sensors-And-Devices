import { Connection, createConnection, getRepository } from 'typeorm';
import { config, DIALECT } from './config';
import logger from './logger';
import { DeviceEntry } from './entity/device.model';

let connection: Promise<Connection>;
connection = createConnection({
  entities: [__dirname + '/entity/*{.ts,js}'],
  type: DIALECT,
  database: config.DATABASE.NAME,
  host: config.DATABASE.HOST,
  port: Number(config.DATABASE.PORT),
  username: config.DATABASE.USER,
  password: config.DATABASE.PASS,
  synchronize: config.DATABASE.SYNC,
  logging: config.DATABASE.LOG,
});

/**
 * Make a connection to the database.
 * @param con The connection object.
 * @constructor
 */
export async function ConnectToDatabase(con: Promise<Connection>) {
  try {
    const connection = await con;
    await connection.query('select 1+1 as answer');
    await connection.synchronize();
  } catch (e) {
    logger.error(`Could not synchronize database, error=${e}`);
  }
}

export { connection as Connection };
