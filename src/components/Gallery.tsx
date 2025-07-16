// src/components/Gallery.tsx - Fixed version
import { useState, useEffect } from "react";
import { Eye, ExternalLink, RefreshCw } from "lucide-react";

interface Sketch {
  id: string;
  timestamp: number;
  owner: string;
  tags: { name: string; value: string }[];
}

const Gallery = ({ walletAddress }: { walletAddress: string }) => {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSketches = async () => {
    if (!walletAddress) {
      setSketches([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Updated GraphQL query for Arweave
      const query = `
        query GetSketches($owners: [String!]!) {
          transactions(
            owners: $owners
            tags: [
              { name: "App-Name", values: ["SketchWeave"] }
              { name: "Type", values: ["sketch"] }
            ]
            first: 100
            sort: HEIGHT_DESC
          ) {
            edges {
              node {
                id
                owner {
                  address
                }
                tags {
                  name
                  value
                }
                block {
                  timestamp
                  height
                }
              }
            }
          }
        }
      `;

      console.log("🔍 Fetching sketches for wallet:", walletAddress);

      const response = await fetch("https://arweave.net/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            owners: [walletAddress],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("📡 GraphQL Response:", result);

      if (result.errors) {
        throw new Error(`GraphQL error: ${result.errors[0].message}`);
      }

      if (!result.data || !result.data.transactions) {
        throw new Error("Invalid response structure");
      }

      const fetchedSketches: Sketch[] = result.data.transactions.edges.map(
        (edge: {
          node: {
            id: string;
            block?: { timestamp?: number };
            owner?: { address?: string };
            tags?: { name: string; value: string }[];
          };
        }) => ({
          id: edge.node.id,
          timestamp: edge.node.block?.timestamp
            ? edge.node.block.timestamp * 1000
            : Date.now(),
          owner: edge.node.owner?.address || walletAddress,
          tags: edge.node.tags || [],
        })
      );

      console.log("✅ Fetched sketches:", fetchedSketches);
      setSketches(fetchedSketches);
    } catch (error) {
      console.error("❌ Error fetching sketches:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );

      // Fallback: Try simpler query
      try {
        console.log("🔄 Trying fallback query...");
        const fallbackQuery = `
          query {
            transactions(
              owners: ["${walletAddress}"]
              first: 50
            ) {
              edges {
                node {
                  id
                  tags {
                    name
                    value
                  }
                  block {
                    timestamp
                  }
                }
              }
            }
          }
        `;

        const fallbackResponse = await fetch("https://arweave.net/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: fallbackQuery }),
        });

        const fallbackResult = await fallbackResponse.json();

        if (fallbackResult.data?.transactions?.edges) {
          const allTransactions = fallbackResult.data.transactions.edges;
          const sketchTransactions = allTransactions.filter(
            (edge: { node: { tags?: { name: string; value: string }[] } }) => {
              const tags = edge.node.tags || [];
              return tags.some(
                (tag: { name: string; value: string }) =>
                  tag.name === "App-Name" &&
                  (tag.value === "SketchWeave" || tag.value === "SketchPad")
              );
            }
          );

          const fallbackSketches: Sketch[] = sketchTransactions.map(
            (edge: {
              node: {
                id: string;
                block?: { timestamp?: number };
                tags?: { name: string; value: string }[];
              };
            }) => ({
              id: edge.node.id,
              timestamp: edge.node.block?.timestamp
                ? edge.node.block.timestamp * 1000
                : Date.now(),
              owner: walletAddress,
              tags: edge.node.tags || [],
            })
          );

          console.log("✅ Fallback sketches found:", fallbackSketches);
          setSketches(fallbackSketches);
          setError(null);
        }
      } catch (fallbackError) {
        console.error("❌ Fallback query also failed:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSketches();
  }, [walletAddress, fetchSketches]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSketchTitle = (
    tags: { name: string; value: string }[],
    index: number
  ) => {
    const titleTag = tags.find((tag) => tag.name === "Title");
    return titleTag?.value || `Sketch #${index + 1}`;
  };

  if (!walletAddress) {
    return (
      <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border">
        <h2 className="text-lg font-bold mb-2 text-gray-800">
          Your Saved Sketches
        </h2>
        <p className="text-gray-600 text-sm">
          Connect your wallet to view saved sketches
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg border max-w-md">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold text-gray-800">Your Saved Sketches</h2>
        <button
          onClick={fetchSketches}
          disabled={loading}
          className="p-1 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 text-gray-600">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading your sketches...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <p className="text-red-700 text-sm font-medium">
            Error loading sketches
          </p>
          <p className="text-red-600 text-xs mt-1">{error}</p>
          <button
            onClick={fetchSketches}
            className="mt-2 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && sketches.length === 0 && (
        <div className="text-center py-6">
          <div className="text-gray-400 mb-2">🎨</div>
          <p className="text-gray-600 text-sm">No sketches found</p>
          <p className="text-gray-500 text-xs mt-1">
            Create and save some artwork to see it here!
          </p>
        </div>
      )}

      {!loading && sketches.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {sketches.map((sketch, index) => (
            <div
              key={sketch.id}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50/50"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-800 text-sm">
                    {getSketchTitle(sketch.tags, sketches.length - index - 1)}
                  </h3>
                  <p className="text-gray-600 text-xs">
                    {formatDate(sketch.timestamp)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <a
                  href={`https://arweave.net/${sketch.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Eye size={12} />
                  View Art
                </a>
                <a
                  href={`https://viewblock.io/arweave/tx/${sketch.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <ExternalLink size={12} />
                  Details
                </a>
              </div>

              <div className="mt-2 bg-white/80 rounded p-2">
                <p className="text-xs text-gray-500 font-mono break-all">
                  {sketch.id}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {sketches.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Found {sketches.length} saved sketch
            {sketches.length !== 1 ? "es" : ""}
          </p>
        </div>
      )}
    </div>
  );
};

export default Gallery;
