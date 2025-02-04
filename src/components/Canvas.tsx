// src/components/Canvas.tsx
import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import Arweave from 'arweave';

let socket: Socket;

interface Point {
  x: number;
  y: number;
  pressure: number; // For line thickness based on speed
}

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const prevPoint = useRef<Point | null>(null);
  const lastTimeStamp = useRef<number>(0);
  const [arweave, setArweave] = useState<Arweave | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const FEE = '0.01';

  useEffect(() => {
    document.body.style.backgroundColor = '#f0f4f8';  // Light blue-gray background

    const arweaveInit = new Arweave({
      host: 'arweave.net',
      port: 443,
      protocol: 'https',
      timeout: 20000,
    });
    setArweave(arweaveInit);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size with some padding
    canvas.width = window.innerWidth - 40;
    canvas.height = window.innerHeight - 40;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#2d3436'; // Pencil color
    context.lineWidth = 0.5; // Thinner default line

    // Handle window resize
    const handleResize = () => {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = window.innerWidth - 40;
      canvas.height = window.innerHeight - 40;
      context.putImageData(imageData, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#2d3436';
      context.lineWidth = 0.5;
    };

    window.addEventListener('resize', handleResize);

    // Socket.io setup...
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
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Enhanced drawing functions
  const calculatePressure = (timestamp: number): number => {
    if (!lastTimeStamp.current) {
      lastTimeStamp.current = timestamp;
      return 1;
    }

    const timeDiff = timestamp - lastTimeStamp.current;
    lastTimeStamp.current = timestamp;
    
    // Faster movement = lower pressure (thinner line)
    const pressure = Math.max(0.1, Math.min(1, 50 / timeDiff));
    return pressure;
  };

  const drawLine = (currentPoint: Point, previousPoint: Point | null) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    // Set line width based on pressure
    context.lineWidth = currentPoint.pressure * 0.5;

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
      pressure: calculatePressure(e.timeStamp)
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
      pressure: calculatePressure(e.timeStamp)
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

  const connectWallet = async () => {
    try {
      if (!window.arweaveWallet) {
        alert('Please install ArConnect wallet extension');
        window.open('https://arconnect.io', '_blank');
        return;
      }
  
      await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION']);
      const address = await window.arweaveWallet.getActiveAddress();
      setWalletAddress(address);
      setIsConnected(true);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Error connecting wallet');
    }
  };
  

  const saveToArweave = async () => {
    if (!arweave || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }
  
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const balance = await arweave.wallets.getBalance(walletAddress);
      if (parseFloat(balance) <= 0) {
        alert('Please add some AR tokens to your wallet first');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const binaryData = Buffer.from(base64Data, 'base64');
      
      // Create transaction with hidden fee
      const transaction = await arweave.createTransaction({
        data: binaryData,
        quantity: arweave.ar.arToWinston('0.05'), 
        target: "NRGIL3Fn71n1fwEdIgb7vGchBB-ahadO0ndCBNQUdGs"
      });
  
      transaction.addTag('Content-Type', 'image/png');
      transaction.addTag('App-Name', 'SketchWeave');
      transaction.addTag('Type', 'sketch');
  
      await window.arweaveWallet.sign(transaction);
      await arweave.transactions.post(transaction);
  
      // Redirect to saved image
      window.location.href = `https://arweave.net/${transaction.id}`;
    } catch (error) {
        alert('Error: Insufficient balance');
      }
  };

  // Rest of your functions...

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-50 to-gray-100">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="text-xl font-bold text-gray-700">
          SketchWeave
        </div>
        <div className="flex gap-3">
          {!isConnected ? (
            <button
              onClick={connectWallet}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-sm"
            >
              Connect Wallet
            </button>
          ) : (
            <>
              <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-200 text-gray-600 font-mono">
                {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
              </div>
              <button 
                onClick={saveToArweave}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h-2v5.586l-1.293-1.293z" />
                </svg>
                Save Sketch
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        <canvas
          ref={canvasRef}
          className="touch-none bg-white rounded-lg shadow-lg"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>
    </div>
  );
};

export default Canvas;