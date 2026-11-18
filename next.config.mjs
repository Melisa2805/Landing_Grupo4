/** @type {import('next').NextConfig} */
const nextConfig = {
  // Database drivers load at runtime from node_modules instead of being bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
}

export default nextConfig
