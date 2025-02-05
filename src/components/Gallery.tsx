// src/components/Gallery.tsx
import { useState, useEffect } from "react";

interface Sketch {
  id: string;
  timestamp: number;
}

const Gallery = ({ walletAddress }: { walletAddress: string }) => {
  const [sketches, setSketches] = useState<Sketch[]>([]);

  useEffect(() => {
    if (!walletAddress) return;

    const fetchSketches = async () => {
      // const arweave = new Arweave({
      //   host: "testnet.redstone.tools",
      //   port: 443,
      //   protocol: "https",
      // });

      try {
        // GraphQL query to fetch sketches
        const query = `{
          transactions(
            owners: ["${walletAddress}"]
            tags: [
              { name: "App-Name", values: ["SketchPad"] }
              { name: "Type", values: ["sketch"] }
            ]
          ) {
            edges {
              node {
                id
                block {
                  timestamp
                }
              }
            }
          }
        }`;

        const response = await fetch("https://arweave.net/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await response.json();
        const fetchedSketches = data.data.transactions.edges.map(
          (edge: { node: { id: string; block: { timestamp: number } } }) => ({
            id: edge.node.id,
            timestamp: edge.node.block?.timestamp || Date.now(),
          })
        );

        setSketches(fetchedSketches);
      } catch (error) {
        console.error("Error fetching sketches:", error);
      }
    };

    fetchSketches();
  }, [walletAddress]);

  return (
    <div className="absolute bottom-4 left-4 bg-white p-4 rounded-lg shadow-lg">
      <h2 className="text-lg font-bold mb-2">Your Saved Sketches</h2>
      <div className="flex flex-col gap-2">
        {sketches.map((sketch) => (
          <div key={sketch.id} className="flex gap-2">
            <a
              href={`https://arweave.net/${sketch.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View Sketch
            </a>
            <span className="text-gray-500">|</span>
            <a
              href={`https://viewblock.io/arweave/tx/${sketch.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:underline"
            >
              Transaction Details
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Gallery;
