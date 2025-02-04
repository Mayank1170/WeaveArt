// src/components/Canvas.tsx
import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import Arweave from 'arweave';
import Gallery from './Gallery';

let socket: Socket;

interface Point {
  x: number;
  y: number;
}

interface JWKInterface {
  kty: string;
  n: string;
  e: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
}

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const prevPoint = useRef<Point | null>(null);
  const [arweave, setArweave] = useState<Arweave | null>(null);
  const [walletKey, setWalletKey] = useState<JWKInterface | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');

  useEffect(() => {
    const initializeArweave = async () => {
      // Initialize local Arweave
      const arweaveInit = new Arweave({
        host: 'localhost',
        port: 1984,
        protocol: 'http',
        timeout: 20000,
      });
      setArweave(arweaveInit);

      try {
        // Generate a test wallet
        const key = await arweaveInit.wallets.generate();
        const address = await arweaveInit.wallets.jwkToAddress(key);
        
        // Add test funds using Arweave API
        try {
          await arweaveInit.api.get(`/mint/${address}/1000000000000000`);
          console.log('Wallet funded successfully');
        } catch (mintError) {
          console.error('Error funding wallet:', mintError);
        }
        
        setWalletKey(key);
        setWalletAddress(address);
        console.log('Wallet initialized with address:', address);

        // Check balance
        const balance = await arweaveInit.wallets.getBalance(address);
        console.log('Wallet balance:', arweaveInit.ar.winstonToAr(balance));

      } catch (error) {
        console.error('Error initializing wallet:', error);
      }
    };

    initializeArweave();

    // Canvas setup
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#666666';
    context.lineWidth = 1;

    // Socket.io setup
    const socketInitializer = async () => {
      await fetch('/api/socket');
      socket = io(undefined, {
        path: '/api/socket',
      });

      socket.on('draw-line', (data) => {
        drawLine(data.currentPoint, data.previousPoint);
      });
    };

    socketInitializer();

    return () => {
      socket?.disconnect();
    };
  }, []);

  const verifyImage = async (txId: string) => {
    try {
      // Get transaction data
      if (!arweave) {
        console.error('Arweave is not initialized');
        return;
      }
      const transaction = await arweave.transactions.get(txId);
      const data = transaction.get('data', { decode: true, string: false });
      
      // Create object URL
      const blob = new Blob([data], { type: 'image/png' });
      const imageUrl = URL.createObjectURL(blob);
      
      // Open in new tab
      window.open(imageUrl, '_blank');
    } catch (error) {
      console.error('Error verifying image:', error);
      alert('Error loading image');
    }
  };

  const saveToArweave = async () => {
    if (!arweave || !walletKey) {
      console.error('Missing requirements:', { arweave: !!arweave, walletKey: !!walletKey });
      alert('Waiting for wallet initialization...');
      return;
    }

    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      console.log('Starting save process...');
      
      // Get the base64 data URL from canvas
      const dataUrl = canvas.toDataURL('image/png');
      
      // Convert base64 to binary data
      const base64Data = dataUrl.split(',')[1];
      const binaryData = Buffer.from(base64Data, 'base64');
      
      // Create transaction with binary data
      const transaction = await arweave.createTransaction({
        data: binaryData
      }, walletKey);

      // Add proper content type tag
      transaction.addTag('Content-Type', 'image/png');
      transaction.addTag('App-Name', 'SketchPad');
      transaction.addTag('Type', 'sketch');

      console.log('Transaction created');

      // Sign transaction
      await arweave.transactions.sign(transaction, walletKey);
      console.log('Transaction signed');
      
      // Post transaction
      const uploader = await arweave.transactions.getUploader(transaction);
      while (!uploader.isComplete) {
        await uploader.uploadChunk();
        console.log(`Upload progress: ${uploader.pctComplete}%`);
      }
      
      console.log('Transaction uploaded:', transaction.id);
      
      // Check balance after transaction
      const balance = await arweave.wallets.getBalance(walletAddress);
      console.log('Wallet balance after transaction:', arweave.ar.winstonToAr(balance));
      
      alert(`Sketch saved! Transaction ID: ${transaction.id}\nView at: http://localhost:1984/${transaction.id}`);
    } catch (error) {
      console.error('Error saving to Arweave:', error);
      if (error instanceof Error) {
        alert(`Error saving sketch: ${error.message}`);
      } else {
        alert('An unknown error occurred');
      }
    }
  };

  // Drawing functions remain the same
  const drawLine = (currentPoint: Point, previousPoint: Point | null) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    context.beginPath();
    if (previousPoint) {
      context.moveTo(previousPoint.x, previousPoint.y);
    } else {
      context.moveTo(currentPoint.x - 1, currentPoint.y);
    }
    context.lineTo(currentPoint.x, currentPoint.y);
    context.stroke();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    
    setIsPainting(true);
    const currentPoint = {
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    };
    prevPoint.current = currentPoint;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPainting) return;

    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const currentPoint = {
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    };

    drawLine(currentPoint, prevPoint.current);
    socket?.emit('draw-line', {
      currentPoint,
      previousPoint: prevPoint.current
    });

    prevPoint.current = currentPoint;
  };

  const onMouseUp = () => {
    setIsPainting(false);
    prevPoint.current = null;
  };

  return (
    <div className="relative w-screen h-screen">
      <div className="absolute top-4 right-4 flex gap-2">
        <div className="px-4 py-2 bg-gray-100 rounded">
          {walletAddress ? 
            `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 
            'Initializing wallet...'
          }
        </div>
        <div className="flex gap-2">
  <button 
    onClick={saveToArweave}
    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
    disabled={!walletKey}
  >
    {walletKey ? 'Save Sketch' : 'Initializing...'}
  </button>
  <input 
    type="text" 
    placeholder="Transaction ID"
    className="px-2 border rounded"
    onKeyPress={(e) => {
      if (e.key === 'Enter') {
        verifyImage(e.currentTarget.value);
      }
    }}
  />
</div>
      </div>
      <canvas
        ref={canvasRef}
        className="touch-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </div>
  );
};

export default Canvas;