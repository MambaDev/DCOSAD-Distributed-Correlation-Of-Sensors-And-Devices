/**
 * A request body generator that is used ensure the correct data is being used through out and consistent.
 * @param {string} id The id of the device sending the data.
 * @param {boolean} invalidData If the data is false (for the experiment)
 * @param {string} temperature The temperature.
 * @param {number} humidity The humidity.
 */
const dataRequestGenerator = (id, invalidData, temperature, humidity) => {
  return { id, invalidData, temperature, humidity };
};

module.exports = {
  dataRequestGenerator,
};
