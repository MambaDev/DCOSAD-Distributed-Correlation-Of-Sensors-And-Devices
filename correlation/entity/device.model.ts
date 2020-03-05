import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('device_entry')
export class DeviceEntry {
  // the generated id of the entry.
  @PrimaryGeneratedColumn()
  id: number;

  // the id of the device that was assigned to the device.
  @Column()
  deviceId: string;

  // the zone of which the device was allocated at the time of fault.
  @Column()
  zone: number;

  // the second of which the device was allocated at the time of fault.
  @Column()
  section: number;

  // the type of reporting that was taken place, e.g too high, low, flux, dead etc.
  @Column()
  reportingType: string;

  // if it was actually reporting as invalid or not.
  // e.g did a real reporting information was flagged as dead or not.
  @Column()
  invalid: boolean;

  // The reason it failed, what three methods did catch it.
  @Column()
  reason: string;

  // The percentage of which was it was within at the time.
  @Column()
  percentage: string;

  // The temperature at point of recording.
  @Column()
  temperature: string;

  // The humidity at point of recording (currently not used).
  @Column()
  humidity: string;

  /**
   * Creates a new instance of the device entry.
   * @param device
   * @param zone
   * @param section
   * @param reportingType
   * @param invalid
   * @param reason
   * @param percentage
   * @param temp
   * @param hum
   */
  constructor(device, zone, section, reportingType, invalid, reason, percentage, temp, hum) {
    this.deviceId = device;
    this.zone = zone;
    this.section = section;
    this.reportingType = reportingType;
    this.invalid = invalid;
    this.reason = reason;
    this.percentage = percentage;
    this.temperature = temp;
    this.humidity = hum;
  }
}
