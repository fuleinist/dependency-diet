import express from 'express';
import get from 'lodash/get';
import { join } from 'node:path';

const app = express();
app.get('/', (_req, res) => res.send(get({ greeting: 'hi' }, 'greeting')));
app.listen(3000, () => console.log(join('up', 'on', '3000')));
