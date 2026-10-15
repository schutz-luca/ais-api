import 'dotenv/config';
import express from 'express'
import cors from 'cors'
import { listLogs } from './db/logs';
import { createDimonaOrdersEndpoint } from './controllers/create-dimona-orders';
import { orderPaidEndpoint } from './controllers/order-paid';
import { addTracking, findShopifyOrder, getShopifyOrder } from './services/shopify.service';
import { addNFe } from './services/bling.service';
import { getCollectionsEndpoint } from './controllers/shopify/get-collections';
import { insertProductEndpoint } from './controllers/insert-product';
import { getDesignInDrive } from './services/drive.service';
import {
  clearDashboardCookieOptions,
  createDashboardSession,
  dashboardCookieOptions,
  dashboardCorsHeaders,
  DASHBOARD_COOKIE_NAME,
  isDashboardOriginAllowed,
  isDashboardPasswordConfigured,
  isDashboardSessionValid,
  verifyDashboardPassword,
} from './utils/dashboardAuth';
import { Request, Response, NextFunction } from 'express';
const multer = require("multer");

// import { orderExample } from './ignore/order.example';
// const result = orderExample

const port = process.env.PORT || '8080';
const app = express()
const upload = multer({ storage: multer.memoryStorage() });
const dashboardOrigins = (process.env.DASHBOARD_ORIGIN || 'http://localhost:5173').split(',').map(origin => origin.trim());

app.use(express.json())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || dashboardOrigins.includes(origin)) return callback(null, origin || true);
    return callback(new Error('Origin is not allowed to access the dashboard API'));
  },
  credentials: true,
}))

const requireDashboardSession = (req: Request, res: Response, next: NextFunction) => {
  if (!isDashboardOriginAllowed(req.get('origin')) || !isDashboardSessionValid(req.headers.cookie))
    return res.status(401).json({ error: 'Faça login para acessar o dashboard.' });
  next();
};

app.post('/dashboard/login', (req, res) => {
  if (!isDashboardPasswordConfigured())
    return res.status(503).json({ error: 'A senha do dashboard ainda não foi configurada no servidor.' });
  if (!verifyDashboardPassword(req.body?.password))
    return res.status(401).json({ error: 'Senha incorreta.' });

  const session = createDashboardSession();
  if (!session) return res.status(503).json({ error: 'Não foi possível iniciar a sessão do dashboard.' });
  res.setHeader('Set-Cookie', `${DASHBOARD_COOKIE_NAME}=${session}; ${dashboardCookieOptions()}`);
  return res.json({ authenticated: true });
});

app.get('/dashboard/session', (req, res) => {
  const authenticated = isDashboardSessionValid(req.headers.cookie);
  return res.status(authenticated ? 200 : 401).json({ authenticated });
});

app.post('/dashboard/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${DASHBOARD_COOKIE_NAME}=; ${clearDashboardCookieOptions()}`);
  return res.json({ authenticated: false });
});

app.get('/dashboard/logs', requireDashboardSession, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  if (search.length > 100)
    return res.status(400).json({ error: 'A busca deve ter até 100 caracteres.' });

  try {
    return res.json(await listLogs({ search, cursor }));
  } catch (error) {
    if (error instanceof Error && error.message === 'Cursor de paginação inválido.')
      return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
});

app.get('/', (_, res) => {
  res.send('🚀 This is the AI Spirit API')
})

// Endpoint triggered on Shopify order payment webhook
app.post(`/order-paid`, orderPaidEndpoint)

// Get all Shopify paid orders and create Dimona orders if it wasn't created yet
app.get('/create-dimona-orders', requireDashboardSession, createDimonaOrdersEndpoint)

app.get('/shopify-order', requireDashboardSession, getShopifyOrder)

app.get('/collections', requireDashboardSession, getCollectionsEndpoint)

app.post('/insert-product', requireDashboardSession, upload.fields([
  { name: 'designFrontMale' },
  { name: 'designBackMale' },
  { name: 'designFrontFemale' },
  { name: 'designBackFemale' }
]), insertProductEndpoint);

app.post('/add-tracking', requireDashboardSession, async (req, res) => {
  const orderId = req.body.orderId as number;
  const dimonaOrderId = req.body.dimonaOrderId as string;

  const result = await addTracking(orderId, dimonaOrderId);
  res.json({ trackingStatus: result })
})

app.post('/add-nfe', requireDashboardSession, async (req, res) => {
  const orderId = req.body.orderId as number;
  const dimonaOrderId = req.body.dimonaOrderId as string;

  const order = await findShopifyOrder(orderId);
  const nfeStatus = await addNFe(order, dimonaOrderId)

  res.json({ nfeStatus })
})

app.post('/check-design', requireDashboardSession, async (req, res) => {
  const sku = req.body.sku as string;

  const designs =  await getDesignInDrive(sku);
  res.json({ designs })
})

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)

export default app;
