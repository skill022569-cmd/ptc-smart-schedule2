// server/src/index.ts
import 'dotenv/config';
import express from 'express';
import path from 'path';
import utilityRoutes from './routes/utilityRoutes';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', utilityRoutes);
app.use(express.static(path.resolve(__dirname, '../public')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`PTC Smart Schedule: http://localhost:${port}`));
