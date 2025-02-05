// src/server/arweave-server.ts
import ArLocal from 'arlocal';

const start = async () => {
  const arlocal = new ArLocal(1984, false, false, false, true);
  await arlocal.start();
  console.log('ArLocal started on port 1984');
};

start().catch(console.error);