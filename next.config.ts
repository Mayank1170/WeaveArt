/** @type {import('next').NextConfig} */
interface WebpackConfig {
  externals: Record<string, string>[];
}

interface NextConfig {
  reactStrictMode: boolean;
  webpack: (config: WebpackConfig) => WebpackConfig;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
};
  
  module.exports = nextConfig;