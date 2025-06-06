const express = require('express');
const path = require('path');
const api = require('./api');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use('/api', api);
app.use(express.static(path.join(__dirname, '../../public')));

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
}); 