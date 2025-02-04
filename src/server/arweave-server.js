const ArLocal = require('arlocal').default;

const start = async () => {
  const arlocal = new ArLocal(1984, false, false, false, true); // Enable CORS
  await arlocal.start();
  console.log('ArLocal started on port 1984');
};

start().catch(console.error);