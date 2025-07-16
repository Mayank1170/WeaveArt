// Enhanced Canvas.tsx with local backup and better Arweave integration
import { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import Arweave from "arweave";

let socket: Socket;

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface LocalSketch {
  id: string;
  timestamp: string;
  dataUrl: string;
  arweaveId?: string;
  title: string;
}

const Canvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const prevPoint = useRef<Point | null>(null);
  const lastTimeStamp = useRef<number>(0);
  const [arweave, setArweave] = useState<Arweave | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [localSketches, setLocalSketches] = useState<LocalSketch[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [saving, setSaving] = useState(false);

  // Socket states
  const [socketConnected, setSocketConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [showUserCount, setShowUserCount] = useState(true);

  // UI states
  const [showWalletPanel, setShowWalletPanel] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);

  useEffect(() => {
    // Load local sketches
    const saved = localStorage.getItem("weaveArt_sketches");
    if (saved) {
      try {
        setLocalSketches(JSON.parse(saved));
      } catch (error) {
        console.error("Error loading local sketches:", error);
      }
    }

    // Initialize Arweave
    const arweaveInit = new Arweave({
      host: "arweave.net",
      port: 443,
      protocol: "https",
      timeout: 20000,
    });
    setArweave(arweaveInit);

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#2d3436";
    context.lineWidth = 2;

    // Socket initialization
    const initSocket = async () => {
      try {
        await fetch("/api/socket");
        socket = io(undefined, { path: "/api/socket" });

        socket.on("connect", () => {
          setSocketConnected(true);
          console.log("✅ Connected to socket");
        });

        socket.on("disconnect", () => {
          setSocketConnected(false);
          console.log("❌ Disconnected from socket");
        });

        socket.on("draw-line", (data) => {
          drawLine(data.currentPoint, data.previousPoint);
        });

        socket.on("clear-canvas", () => {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        });
      } catch (error) {
        console.error("Socket initialization failed:", error);
      }
    };

    initSocket();

    // Hide user count after 3 seconds
    const timer = setTimeout(() => setShowUserCount(false), 3000);

    return () => {
      socket?.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Save sketches to localStorage
  const saveToLocal = (sketches: LocalSketch[]) => {
    localStorage.setItem("weaveArt_sketches", JSON.stringify(sketches));
    setLocalSketches(sketches);
  };

  const calculatePressure = (timestamp: number): number => {
    if (!lastTimeStamp.current) {
      lastTimeStamp.current = timestamp;
      return 1;
    }
    const timeDiff = timestamp - lastTimeStamp.current;
    lastTimeStamp.current = timestamp;
    return Math.max(0.3, Math.min(1.5, 50 / timeDiff));
  };

  const drawLine = (currentPoint: Point, previousPoint: Point | null) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    context.lineWidth = currentPoint.pressure * 2;
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
      pressure: calculatePressure(e.timeStamp),
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
      pressure: calculatePressure(e.timeStamp),
    };

    drawLine(currentPoint, prevPoint.current);

    if (socket?.connected) {
      socket.emit("draw-line", {
        currentPoint,
        previousPoint: prevPoint.current,
      });
    }

    prevPoint.current = currentPoint;
  };

  const onMouseUp = () => {
    setIsPainting(false);
    prevPoint.current = null;
  };

  const connectWallet = async () => {
    try {
      if (!window.arweaveWallet) {
        alert("Please install ArConnect wallet extension");
        window.open("https://arconnect.io", "_blank");
        return;
      }

      await window.arweaveWallet.connect([
        "ACCESS_ADDRESS",
        "SIGN_TRANSACTION",
      ]);
      const address = await window.arweaveWallet.getActiveAddress();
      setWalletAddress(address);
      setIsConnected(true);
      setShowWalletPanel(false);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      alert("Error connecting wallet");
    }
  };

  const saveToArweave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    const dataUrl = canvas.toDataURL("image/png");
    const timestamp = new Date().toISOString();
    const localId = `local_${Date.now()}`;

    // Save locally first
    const localSketch: LocalSketch = {
      id: localId,
      timestamp,
      dataUrl,
      title: `Sketch ${new Date().toLocaleDateString()}`,
    };

    const updatedSketches = [localSketch, ...localSketches];
    saveToLocal(updatedSketches);

    if (!isConnected || !arweave) {
      setSaving(false);
      alert(
        "✅ Sketch saved locally! Connect wallet to save permanently to Arweave."
      );
      setShowControlPanel(false);
      return;
    }

    try {
      // Convert canvas to binary data
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Create Arweave transaction
      const transaction = await arweave.createTransaction({ data });
      transaction.addTag("Content-Type", "image/png");
      transaction.addTag("App-Name", "SketchWeave");
      transaction.addTag("Type", "sketch");
      transaction.addTag("Title", localSketch.title);
      transaction.addTag("Created-At", timestamp);

      await window.arweaveWallet.sign(transaction);
      const result = await arweave.transactions.post(transaction);

      if (result.status === 200) {
        // Update local sketch with Arweave ID
        const updatedSketchWithArweave = {
          ...localSketch,
          arweaveId: transaction.id,
        };

        const finalSketches = updatedSketches.map((s) =>
          s.id === localId ? updatedSketchWithArweave : s
        );
        saveToLocal(finalSketches);

        alert(
          `✅ Sketch saved to Arweave!\n\n🔗 View at: https://arweave.net/${transaction.id}\n📋 Transaction ID: ${transaction.id}`
        );
      } else {
        throw new Error(`Upload failed with status: ${result.status}`);
      }
    } catch (error) {
      console.error("Arweave save error:", error);
      alert(
        `⚠️ Sketch saved locally, but Arweave upload failed.\nError: ${error}`
      );
    } finally {
      setSaving(false);
      setShowControlPanel(false);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      socket?.emit("clear-canvas");
    }
    setShowControlPanel(false);
  };

  const deleteLocalSketch = (id: string) => {
    const updated = localSketches.filter((s) => s.id !== id);
    saveToLocal(updated);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-50">
      {/* User Count Notification */}
      <div
        className={`absolute top-4 left-1/2 transform -translate-x-1/2 transition-all duration-500 z-20 ${
          showUserCount
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border flex items-center gap-2">
          <span className="text-blue-500">👥</span>
          <span className="text-sm font-medium text-gray-700">
            {userCount} artist{userCount !== 1 ? "s" : ""} online
          </span>
        </div>
      </div>

      {/* Wallet Panel */}
      <div
        className={`absolute top-4 right-0 transform transition-transform duration-300 z-10 ${
          showWalletPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="bg-white/95 backdrop-blur-sm p-4 rounded-l-lg shadow-lg border-l border-t border-b min-w-64">
          <h3 className="font-semibold mb-3 text-gray-800">Wallet</h3>
          {!isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Connect to save permanently on Arweave
              </p>
              <button
                onClick={connectWallet}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Connect ArConnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <p className="text-green-600 font-medium">✅ Connected</p>
                <p className="text-gray-600 font-mono text-xs">
                  {walletAddress.slice(0, 8)}...{walletAddress.slice(-4)}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsConnected(false);
                  setWalletAddress("");
                }}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div
        className={`absolute bottom-4 right-0 transform transition-transform duration-300 z-10 ${
          showControlPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="bg-white/95 backdrop-blur-sm p-4 rounded-l-lg shadow-lg border-l border-t border-b">
          <h3 className="font-semibold mb-3 text-gray-800">Controls</h3>
          <div className="space-y-2">
            <button
              onClick={saveToArweave}
              disabled={saving}
              className="w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              {saving ? "⏳ Saving..." : "💾 Save Sketch"}
            </button>
            <button
              onClick={clearCanvas}
              className="w-full bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              🗑️ Clear Canvas
            </button>
            <button
              onClick={() => setShowGallery(true)}
              className="w-full bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
            >
              🖼️ Gallery ({localSketches.length})
            </button>
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
        <button
          onClick={() => setShowWalletPanel(!showWalletPanel)}
          className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
            isConnected ? "bg-green-500 text-white" : "bg-white text-gray-700"
          }`}
        >
          💳
        </button>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
        <button
          onClick={() => setShowControlPanel(!showControlPanel)}
          className="w-12 h-12 bg-white rounded-full shadow-lg transition-all duration-200 flex items-center justify-center text-gray-700"
        >
          ⚙️
        </button>
      </div>

      {/* Gallery Modal */}
      {showGallery && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">
                Your Sketches ({localSketches.length})
              </h2>
              <button
                onClick={() => setShowGallery(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-96">
              {localSketches.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No sketches saved yet!
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {localSketches.map((sketch) => (
                    <div
                      key={sketch.id}
                      className="border rounded-lg p-3 bg-gray-50"
                    >
                      <img
                        src={sketch.dataUrl}
                        alt={sketch.title}
                        className="w-full h-32 object-contain bg-white rounded mb-2"
                      />
                      <div className="space-y-2">
                        <p className="font-medium text-sm">{sketch.title}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(sketch.timestamp).toLocaleString()}
                        </p>
                        <div className="flex gap-2">
                          {sketch.arweaveId ? (
                            <a
                              href={`https://arweave.net/${sketch.arweaveId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 bg-blue-500 text-white px-2 py-1 rounded text-xs text-center"
                            >
                              View on Arweave
                            </a>
                          ) : (
                            <span className="flex-1 bg-gray-300 text-gray-600 px-2 py-1 rounded text-xs text-center">
                              Local Only
                            </span>
                          )}
                          <button
                            onClick={() => deleteLocalSketch(sketch.id)}
                            className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
      />
    </div>
  );
};

export default Canvas;
