// Точка входа для проверки на Windows: настоящая оболочка app/boot.js, но своя папка данных
// и подменённый ответ сервера доступа (только в этом тестовом процессе, в приложение не попадает).
const { app, net } = require('electron'), path = require('path');
if (process.env.MLA_USERDATA) app.setPath('userData', process.env.MLA_USERDATA);
const real = net.fetch.bind(net);
net.fetch = async (u, o) => {
  u = String(u && u.url || u);
  if (/workers\.dev\//.test(u)) return /\/v1\/check/.test(u) ? new Response('ok', { status: 200 }) : new Response('', { status: 404 });
  return real(u, o);
};
require(path.join(__dirname, '..', '..', 'app', 'boot.js'));
