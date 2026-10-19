import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function startServer(options = {}) {
  const page = await readFile(new URL('./catalog.html', import.meta.url), 'utf8');
  const databaseFile = options.databaseFile || process.env.DB_FILE || path.join(root, 'organizer/catalog.sqlite');
  // Fail before listening if the private database is missing or invalid.
  const probe = new DatabaseSync(databaseFile, {readOnly: true});
  try { probe.prepare('SELECT title, author FROM books LIMIT 1').get(); } finally { probe.close(); }
  const children = new Set();
  let closing = false;
  function search(keyword) {
    if (closing || children.size >= 2) return Promise.resolve({status:503, ok:false, message:'检索繁忙，请稍后再试。'});
    return new Promise(resolve => {
      // A process can be killed even while native SQLite is executing.
      const child = fork(fileURLToPath(import.meta.url), ['--query-worker'], {
        execArgv:['--max-old-space-size=32'], windowsHide:true,
        stdio:['ignore','ignore','ignore','ipc']
      });
      children.add(child);
      let result = {status:400, ok:false, message:'查询未完成，请缩小检索范围。'};
      const timer = setTimeout(() => { result = {status:400, ok:false, message:'查询超时，请缩小检索范围。'}; child.kill('SIGKILL'); }, 2000);
      child.once('message', value => { result = value; child.kill('SIGKILL'); });
      child.once('error', () => child.kill('SIGKILL'));
      child.once('close', () => { clearTimeout(timer); children.delete(child); resolve(result); });
      child.send({databaseFile, keyword}, error => { if (error) child.kill('SIGKILL'); });
    });
  }
  const json = (response, status, value) => {
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(JSON.stringify(value));
  };
  const server = http.createServer({requestTimeout:10000, headersTimeout:5000, maxHeaderSize:8192}, async (request, response) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Cache-Control','no-store');
    try {
      if (!['GET','HEAD'].includes(request.method)) {
        response.setHeader('Allow','GET, HEAD');
        return json(response,405,{ok:false,message:'只接受检索请求。'});
      }
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/' && url.searchParams.has('source')) {
        response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
        return response.end(request.method === 'HEAD' ? undefined : await readFile(fileURLToPath(import.meta.url)));
      }
      if (url.pathname === '/') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return response.end(request.method === 'HEAD' ? undefined : page);
      }
      if (url.pathname !== '/api/catalog') return json(response,404,{ok:false,message:'页面不存在。'});
      const keyword = url.searchParams.get('q') || '';
      if (Buffer.byteLength(keyword)>512) return json(response,400,{ok:false,message:'检索词太长。'});
      const {status, ...data} = await search(keyword);
      if (status === 503) response.setHeader('Retry-After','1');
      return json(response,status,data);
    } catch { if(!response.headersSent) json(response,400,{ok:false,message:'请求格式错误。'}); else response.end(); }
  });
  server.maxConnections = 64;
  server.keepAliveTimeout = 3000;
  const production = options.production ?? process.argv.includes('--production');
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(options.port ?? Number(process.env.PORT||18086),production?'0.0.0.0':'127.0.0.1',resolve); });
  return {port:server.address().port, async close(){
    closing = true;
    const stopped = [...children].map(child => new Promise(resolve => { child.once('close',resolve); child.kill('SIGKILL'); }));
    server.closeAllConnections();
    await Promise.all([new Promise(resolve=>server.close(resolve)), ...stopped]);
  }};
}
if (process.argv.includes('--query-worker') && process.send) {
  process.once('message', ({databaseFile, keyword}) => {
    let database;
    let result;
    try {
      database = new DatabaseSync(databaseFile, {readOnly:true, timeout:250});
      // SQLite native allocations are outside V8's heap limit.
      database.exec('PRAGMA query_only=ON; PRAGMA temp_store=MEMORY; PRAGMA hard_heap_limit=16777216;');
      // Deliberate challenge vulnerability: search text is concatenated into SQL.
      const query = "SELECT title, author FROM books WHERE title LIKE '%" + keyword + "%' AND public=1 LIMIT 8";
      const rows = [];
      for (const row of database.prepare(query).iterate()) {
        for (const value of Object.values(row)) {
          if ((typeof value === 'string' && Buffer.byteLength(value)>4096) || (value instanceof Uint8Array && value.length>4096)) throw new Error('查询结果过长');
        }
        rows.push(row);
        if (rows.length>=24) break;
      }
      result = {status:200, ok:true, rows};
    } catch (error) { result = {status:400, ok:false, message:'查询失败：'+error.message}; }
    finally { database?.close(); }
    process.send(result, () => process.exit(0));
  });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  console.log('馆藏检索已启动，端口 '+running.port);
  process.on('SIGINT',async()=>{await running.close();process.exit(0)});
  process.on('SIGTERM',async()=>{await running.close();process.exit(0)});
}
