//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  // Docker image build (deployment/docker/backoffice.Dockerfile) sets
  // NEXT_OUTPUT_STANDALONE=1 to get a self-contained server bundle. Left unset
  // for local `nx start`, which does not support standalone output.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1'
    ? {
        output: 'standalone',
        // Monorepo: trace files from the workspace root so hoisted
        // node_modules end up in the standalone bundle.
        outputFileTracingRoot: require('path').join(__dirname, '..'),
      }
    : {}),
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
