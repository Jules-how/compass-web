const path = require('path')
const w = require('next/dist/compiled/webpack/webpack')
w.init()
const root = path.resolve(__dirname, '../../..')
w.webpack({
  mode: 'development', devtool: false,
  entry: path.join(__dirname, 'main.tsx'),
  output: { path: __dirname, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx','.ts','.jsx','.js'], alias: {
    ...Object.fromEntries([
      'sales/SalesOverview', 'offers/OffersDesk', 'outbound/OutboundDesk', 'LeadsPanel', 'TasksPanel', 'ProjectsPanel', 'FunctionsPanel', 'ClientsPanel', 'finances/ExpenseBoard', 'delivery-dept/InstallKanban', 'cs-dept/CsDeptBoard', 'AuthProvider'
    ].map(name => [`@/components/${name}$`, path.join(__dirname, 'panel-stubs.tsx')])),
    '@': path.join(root, 'src'),
    'next/dynamic': path.join(__dirname, 'dynamic-stub.tsx'),
    'next/link': path.join(__dirname, 'next-stubs.tsx'),
    'next/navigation': path.join(__dirname, 'next-stubs.tsx')
  } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.join(__dirname, 'loader.cjs') }] },
  optimization: { minimize: false },
  plugins: [new w.webpack.DefinePlugin({ 'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify('https://fixture.invalid'), 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify('fixture-only') })],
  performance: { hints: false }
}, (err, stats) => {
  if (err || stats.hasErrors()) { console.error(err || stats.toString({ all: false, errors: true })); process.exitCode = 1 }
  else console.log(stats.toString({ all: false, timings: true, assets: true, warnings: true }))
})
