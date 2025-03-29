// fixed_docker_worker.js

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
	// 定义路由表
	const routes = {
		// 生产环境
		"quay": "quay.io",
		"gcr": "gcr.io",
		"k8s-gcr": "k8s.gcr.io",
		"k8s": "registry.k8s.io",
		"ghcr": "ghcr.io",
		"cloudsmith": "docker.cloudsmith.io",
		"nvcr": "nvcr.io",

		// 测试环境
		"test": "registry-1.docker.io",
	};

	if (host in routes) return [routes[host], false];
	else return [hub_host, true];
}

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
	// 预检请求配置
	headers: new Headers({
		'access-control-allow-origin': '*', // 允许所有来源
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS', // 允许的HTTP方法
		'access-control-max-age': '1728000', // 预检请求的缓存时间
	}),
}

/**
 * 构造响应
 * @param {any} body 响应体
 * @param {number} status 响应状态码
 * @param {Object<string, string>} headers 响应头
 */
function makeRes(body, status = 200, headers = {}) {
	headers['access-control-allow-origin'] = '*' // 允许所有来源
	return new Response(body, { status, headers }) // 返回新构造的响应
}

// 修改 workers_url 为固定值或允许配置
// 将常量定义在最上方，方便修改和维护
const WORKER_DOMAIN = 'docker.sy110.eu.org'; // 请替换为您的实际域名
const workers_url = `https://${WORKER_DOMAIN}`;

/**
 * 构造新的URL对象，增强错误处理
 * @param {string} urlStr URL字符串
 * @param {string} base URL base
 * @returns {URL|null} 构造的URL对象或null
 */
function newUrl(urlStr, base) {
	if (!urlStr || !base) {
		console.error('Invalid URL parameters:', { urlStr, base });
		return null;
	}
	
	try {
		console.log(`Constructing new URL object with path ${urlStr} and base ${base}`);
		return new URL(urlStr, base); // 尝试构造新的URL对象
	} catch (err) {
		console.error(`Failed to construct URL with: ${urlStr} and ${base}`, err);
		return null; // 构造失败返回null
	}
}

/**
 * 修改URL中的特定模式，更可靠的实现
 * @param {string} urlString 原始URL字符串
 * @returns {URL} 修改后的URL对象
 */
function transformUrl(urlString) {
	try {
		// 检查URL是否包含%3A但不包含%2F
		if (urlString.includes('%3A') && !urlString.includes('%2F')) {
			// 更明确的替换，先处理查询参数
			const url = new URL(urlString);
			const params = new URLSearchParams(url.search);
			
			// 遍历所有参数，查找并修改包含%3A的参数
			for (const [key, value] of params.entries()) {
				if (value.includes('%3A')) {
					// 将冒号替换为冒号+library/
					const newValue = value.replace(/%3A/g, '%3Alibrary%2F');
					params.set(key, newValue);
				}
			}
			
			// 设置回修改后的查询参数
			url.search = params.toString();
			console.log(`Transformed URL: ${url.toString()}`);
			return url;
		}
		return new URL(urlString);
	} catch (err) {
		console.error('URL transformation error:', err);
		// 返回原始URL作为备用
		return new URL(urlString);
	}
}

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text;
}

async function searchInterface() {
	const html = `
	<!DOCTYPE html>
	<html>
	<head>
		<title>Docker Hub 镜像搜索</title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<style>
		:root {
			--github-color: #f0f6fc;
			--githubbj-color: #010409;
		}
		
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			display: flex;
			flex-direction: column;
			justify-content: center; /* 新增 */
			align-items: center;
			min-height: 100vh;
			margin: 0;
			background: linear-gradient(120deg, #1a90ff 0%, #003eb3 100%);
			padding: 20px;
		}

		.container {
			text-align: center;
			width: 100%;
			max-width: 800px;
			padding: 0 20px;
			margin: 0 auto; /* 修改 */
			display: flex; /* 新增 */
			flex-direction: column; /* 新增 */
			justify-content: center; /* 新增 */
			min-height: 70vh; /* 新增 */
		}

		.github-corner {
			position: fixed;
			top: 0;
			right: 0;
			z-index: 999;
		}

		.github-corner svg {
			fill: var(githubbj-color);
			color: var(--github-color);
			position: absolute;
			top: 0;
			border: 0;
			right: 0;
			width: 80px;
			height: 80px;
		}

		.github-corner a,
		.github-corner a:visited {
		color: var(--github-color) !important;
		}

		.github-corner a,
		.github-corner a:visited {
		color: transparent !important;
		text-decoration: none !important;
		}

		.github-corner .octo-body,
		.github-corner .octo-arm {
		fill: var(--github-color) !important;
		}

		.github-corner:hover .octo-arm {
			animation: octocat-wave 560ms ease-in-out;
		}
			
		@keyframes octocat-wave {
			0%, 100% {
				transform: rotate(0);
			}
			20%, 60% {
				transform: rotate(-25deg);
			}
			40%, 80% {
				transform: rotate(10deg);
			}
		}

		.logo {
			margin-bottom: 30px;
			transition: transform 0.3s ease;
		}
		.logo:hover {
			transform: scale(1.05);
		}
		.title {
			color: white;
			font-size: 2em;
			margin-bottom: 10px;
			text-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.subtitle {
			color: rgba(255,255,255,0.9);
			font-size: 1.1em;
			margin-bottom: 30px;
		}
		.search-container {
			display: flex;
			align-items: stretch;
			width: 100%;
			max-width: 600px;
			margin: 0 auto;
			height: 50px;
		}
		#search-input {
			flex: 1;
			padding: 0 20px;
			font-size: 16px;
			border: none;
			border-radius: 8px 0 0 8px;
			outline: none;
			box-shadow: 0 2px 6px rgba(0,0,0,0.1);
			transition: all 0.3s ease;
			height: 100%;
		}
		#search-button {
			padding: 0 25px;
			background-color: #0066ff;
			border: none;
			border-radius: 0 8px 8px 0;
			cursor: pointer;
			transition: all 0.3s ease;
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#search-button:hover {
			background-color: #0052cc;
			transform: translateY(-1px);
		}
		#search-button svg {
			width: 24px;
			height: 24px;
		}
		.tips {
			color: rgba(255,255,255,0.8);
			margin-top: 20px;
			font-size: 0.9em;
		}
		@media (max-width: 480px) {
			.container {
				padding: 0 15px;
				min-height: 60vh; /* 新增 */
			}
			.github-corner svg {
				width: 60px;
				height: 60px;
			}
			.github-corner:hover .octo-arm {
				animation: none;
			}
			.github-corner .octo-arm {
				animation: octocat-wave 560ms ease-in-out;
			}
			.search-container {
				height: 45px;
			}
			
			#search-input {
				padding: 0 15px;
			}
			
			#search-button {
				padding: 0 20px;
			}
		}
		</style>
	</head>
	<body>
		<a href="https://github.com/cmliu/CF-Workers-docker.io" target="_blank" class="github-corner" aria-label="View source on Github">
			<svg viewBox="0 0 250 250" aria-hidden="true">
				<path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path>
				<path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"></path>
				<path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path>
			</svg>
		</a>
		<div class="container">
			<div class="logo">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" fill="#ffffff" width="120" height="90">
					<path d="M23.763 6.886c-.065-.053-.673-.512-1.954-.512-.32 0-.659.03-1.01.087-.248-1.703-1.651-2.533-1.716-2.57l-.345-.2-.227.328a4.596 4.596 0 0 0-.611 1.433c-.23.972-.09 1.884.403 2.666-.596.331-1.546.418-1.744.42H.752a.753.753 0 0 0-.75.749c-.007 1.456.233 2.864.692 4.07.545 1.43 1.355 2.483 2.409 3.13 1.181.725 3.104 1.14 5.276 1.14 1.016 0 2.03-.092 2.93-.266 1.417-.273 2.705-.742 3.826-1.391a10.497 10.497 0 0 0 2.61-2.14c1.252-1.42 1.998-3.005 2.553-4.408.075.003.148.005.221.005 1.371 0 2.215-.55 2.68-1.01.505-.5.685-.998.704-1.053L24 7.076l-.237-.19Z"></path>
					<path d="M2.216 8.075h2.119a.186.186 0 0 0 .185-.186V6a.186.186 0 0 0-.185-.186H2.216A.186.186 0 0 0 2.031 6v1.89c0 .103.083.186.185.186Zm2.92 0h2.118a.185.185 0 0 0 .185-.186V6a.185.185 0 0 0-.185-.186H5.136A.185.185 0 0 0 4.95 6v1.89c0 .103.083.186.186.186Zm2.964 0h2.118a.186.186 0 0 0 .185-.186V6a.186.186 0 0 0-.185-.186H8.1A.185.185 0 0 0 7.914 6v1.89c0 .103.083.186.186.186Zm2.928 0h2.119a.185.185 0 0 0 .185-.186V6a.185.185 0 0 0-.185-.186h-2.119a.186.186 0 0 0-.185.186v1.89c0 .103.083.186.185.186Zm-5.892-2.72h2.118a.185.185 0 0 0 .185-.186V3.28a.186.186 0 0 0-.185-.186H5.136a.186.186 0 0 0-.186.186v1.89c0 .103.083.186.186.186Zm2.964 0h2.118a.186.186 0 0 0 .185-.186V3.28a.186.186 0 0 0-.185-.186H8.1a.186.186 0 0 0-.186.186v1.89c0 .103.083.186.186.186Zm2.928 0h2.119a.185.185 0 0 0 .185-.186V3.28a.186.186 0 0 0-.185-.186h-2.119a.186.186 0 0 0-.185.186v1.89c0 .103.083.186.185.186Zm0-2.72h2.119a.186.186 0 0 0 .185-.186V.56a.185.185 0 0 0-.185-.186h-2.119a.186.186 0 0 0-.185.186v1.89c0 .103.083.186.185.186Zm2.955 5.44h2.118a.185.185 0 0 0 .186-.186V6a.185.185 0 0 0-.186-.186h-2.118a.185.185 0 0 0-.185.186v1.89c0 .103.083.186.185.186Z"></path>
				</svg>
			</div>
			<h1 class="title">Docker Hub 镜像搜索</h1>
			<p class="subtitle">快速查找、下载和部署 Docker 容器镜像</p>
			<div class="search-container">
				<input type="text" id="search-input" placeholder="输入关键词搜索镜像，如: nginx, mysql, redis...">
				<button id="search-button" title="搜索">
					<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					</svg>
				</button>
			</div>
			<p class="tips">提示：按回车键快速搜索</p>
		</div>
		<script>
		function performSearch() {
			const query = document.getElementById('search-input').value;
			if (query) {
				window.location.href = '/search?q=' + encodeURIComponent(query);
			}
		}
	
		document.getElementById('search-button').addEventListener('click', performSearch);
		document.getElementById('search-input').addEventListener('keypress', function(event) {
			if (event.key === 'Enter') {
				performSearch();
			}
		});
		</script>
	</body>
	</html>
	`;
	return html;
}

export default {
	observability: { enabled: true },
	async fetch(request, env, ctx) {
		const getReqHeader = (key) => request.headers.get(key); // 获取请求头

		let url = new URL(request.url); // 解析请求URL
		const userAgentHeader = request.headers.get('User-Agent');
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
		
		// 获取请求参数中的 ns
		const ns = url.searchParams.get('ns');
		const hostname = url.searchParams.get('hubhost') || url.hostname;
		const hostTop = hostname.split('.')[0]; // 获取主机名的第一部分

		let checkHost; // 在这里定义 checkHost 变量
		// 如果存在 ns 参数，优先使用它来确定 hub_host
		if (ns) {
			if (ns === 'docker.io') {
				hub_host = 'registry-1.docker.io'; // 设置上游地址为 registry-1.docker.io
			} else {
				hub_host = ns; // 直接使用 ns 作为 hub_host
			}
		} else {
			checkHost = routeByHosts(hostTop);
			hub_host = checkHost[0]; // 获取上游地址
		}

		const fakePage = checkHost ? checkHost[1] : false; // 确保 fakePage 不为 undefined
		console.log(`域名头部: ${hostTop} 反代地址: ${hub_host} searchInterface: ${fakePage}`);
		// 更改请求的主机名
		url.hostname = hub_host;
		const hubParams = ['/v1/search', '/v1/repositories'];
		if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
			// 首页改成一个nginx伪装页
			return new Response(await nginx(), {
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
				},
			});
		} else if ((userAgent && userAgent.includes('mozilla')) || hubParams.some(param => url.pathname.includes(param))) {
			if (url.pathname == '/') {
				if (env.URL302) {
					return Response.redirect(env.URL302, 302);
				} else if (env.URL) {
					if (env.URL.toLowerCase() == 'nginx') {
						//首页改成一个nginx伪装页
						return new Response(await nginx(), {
							headers: {
								'Content-Type': 'text/html; charset=UTF-8',
							},
						});
					} else return fetch(new Request(env.URL, request));
				} else	{
					if (fakePage) return new Response(await searchInterface(), {
						headers: {
							'Content-Type': 'text/html; charset=UTF-8',
						},
					});
				}
			} else {
				if (fakePage) url.hostname = 'hub.docker.com';
				if (url.searchParams.get('q')?.includes('library/') && url.searchParams.get('q') != 'library/') {
					const search = url.searchParams.get('q');
					url.searchParams.set('q', search.replace('library/', ''));
				}
				const newRequest = new Request(url, request);
				return fetch(newRequest);
			}
		}

		// 使用改进的URL转换函数替换原来的正则表达式转换
		if (!url.toString().includes('%2F') && url.toString().includes('%3A')) {
			url = transformUrl(url.toString());
			console.log(`handle_url: ${url}`);
		}

		// 处理token请求
		if (url.pathname.includes('/token')) {
			// 创建新的请求URL，但保留原始请求的方法、头部和主体
			const tokenUrl = auth_url + url.pathname + url.search;
			
			console.log(`处理Docker认证请求: ${tokenUrl}`);
			console.log(`认证请求参数: ${url.search}`);
			
			// 复制所有原始头部
			const newHeaders = new Headers(request.headers);
			// 修改Host头部
			newHeaders.set('Host', 'auth.docker.io');
			
			console.log('认证请求头部:');
			for (const [key, value] of request.headers.entries()) {
				console.log(`${key}: ${value}`);
			}
			
			// 创建新的请求对象
			const tokenRequest = new Request(tokenUrl, {
				method: request.method,
				headers: newHeaders,
				body: request.body,
				redirect: 'follow'
			});
			
			// 发送请求并返回响应
			try {
				console.log('发送认证请求到 auth.docker.io...');
				const tokenResponse = await fetch(tokenRequest);
				
				// 克隆响应以便读取内容
				const tokenResponseClone = tokenResponse.clone();
				const responseText = await tokenResponseClone.text();
				
				console.log(`认证响应状态: ${tokenResponse.status}`);
				console.log('认证响应头部:');
				for (const [key, value] of tokenResponse.headers.entries()) {
					console.log(`${key}: ${value}`);
				}
				console.log(`认证响应内容: ${responseText}`);
				
				// 创建并返回新的响应，使用原始响应的内容
				return new Response(responseText, {
					status: tokenResponse.status,
					headers: tokenResponse.headers
				});
			} catch (error) {
				console.error('Token请求失败:', error);
				return new Response(JSON.stringify({
					error: 'Token请求失败',
					message: error.message
				}), {
					status: 500,
					headers: {
						'Content-Type': 'application/json'
					}
				});
			}
		}

		// 修改 /v2/ 请求路径
		if (hub_host == 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
			url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
			console.log(`modified_url: ${url.pathname}`);
		}

		// 构造请求参数 - 优化头部处理
		let parameter = {
			method: request.method,
			headers: new Headers(),
			redirect: 'follow',
			cacheTtl: 3600 // 缓存时间
		};

		// 保留原始请求体
		if (request.body) {
			parameter.body = request.body;
		}

		// 设置关键请求头
		const headersToForward = [
			'User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding',
			'Authorization', 'X-Amz-Content-Sha256'
		];

		// 只复制需要的头部
		for (const header of headersToForward) {
			if (request.headers.has(header)) {
				parameter.headers.set(header, getReqHeader(header));
			}
		}

		// 始终设置这些头部
		parameter.headers.set('Host', hub_host);
		parameter.headers.set('Connection', 'keep-alive');
		parameter.headers.set('Cache-Control', 'max-age=0');

		// 发起请求并处理响应 - 添加错误处理
		try {
			const original_response = await fetch(new Request(url, parameter));
			const original_response_clone = original_response.clone();
			const original_text = original_response_clone.body;
			const response_headers = original_response.headers;
			const new_response_headers = new Headers(response_headers);
			const status = original_response.status;

			// 修改 Www-Authenticate 头
			if (new_response_headers.get("Www-Authenticate")) {
				let auth = new_response_headers.get("Www-Authenticate");
				// 确保使用字符串替换而不是正则表达式
				console.log(`原始 Www-Authenticate 头: ${auth}`);
				
				// 解析认证头部以记录更多详情
				const authParts = auth.split(',');
				for (const part of authParts) {
					console.log(`认证头部部分: ${part.trim()}`);
				}
				
				const modifiedAuth = auth.replace(auth_url, workers_url);
				console.log(`修改后 Www-Authenticate 头: ${modifiedAuth}`);
				
				new_response_headers.set("Www-Authenticate", modifiedAuth);
			}

			// 处理重定向
			if (new_response_headers.get("Location")) {
				const location = new_response_headers.get("Location");
				console.info(`Found redirection location, redirecting to ${location}`);
				return httpHandler(request, location, hub_host);
			}

			// 返回修改后的响应
			return new Response(original_text, {
				status,
				headers: new_response_headers
			});
		} catch (error) {
			console.error('Proxy request failed:', error);
			return new Response(JSON.stringify({
				error: 'Proxy request failed',
				message: error.message || 'Unknown error'
			}), {
				status: 502,
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}
	}
};

/**
 * 处理HTTP请求 - 增加错误处理
 * @param {Request} req 请求对象
 * @param {string} pathname 请求路径
 * @param {string} baseHost 基地址
 */
function httpHandler(req, pathname, baseHost) {
	const reqHdrRaw = req.headers;

	// 处理预检请求
	if (req.method === 'OPTIONS' &&
		reqHdrRaw.has('access-control-request-headers')
	) {
		return new Response(null, PREFLIGHT_INIT);
	}

	let rawLen = '';

	const reqHdrNew = new Headers(reqHdrRaw);

	// 修复s3错误 - 删除认证头
	reqHdrNew.delete("Authorization");

	let urlStr = pathname;

	// 增加urlObj为null的处理
	const urlObj = newUrl(urlStr, 'https://' + baseHost);
	if (!urlObj) {
		console.error('Failed to create URL object for:', pathname);
		return new Response(JSON.stringify({
			error: 'Invalid URL',
			message: `Cannot create URL from ${pathname}`
		}), {
			status: 400,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	/** @type {RequestInit} */
	const reqInit = {
		method: req.method,
		headers: reqHdrNew,
		redirect: 'follow'
	};

	// 保留请求体
	if (req.body) {
		reqInit.body = req.body;
	}

	return proxy(urlObj, reqInit, rawLen);
}

/**
 * 代理请求 - 添加更多错误处理
 * @param {URL} urlObj URL对象
 * @param {RequestInit} reqInit 请求初始化对象
 * @param {string} rawLen 原始长度
 */
async function proxy(urlObj, reqInit, rawLen) {
	try {
		const res = await fetch(urlObj.href, reqInit);
		const resHdrOld = res.headers;
		const resHdrNew = new Headers(resHdrOld);

		// 验证长度
		if (rawLen) {
			const newLen = resHdrOld.get('content-length') || '';
			const badLen = (rawLen !== newLen);

			if (badLen) {
				return makeRes(res.body, 400, {
					'--error': `bad len: ${newLen}, except: ${rawLen}`,
					'access-control-expose-headers': '--error',
				});
			}
		}
		const status = res.status;
		resHdrNew.set('access-control-expose-headers', '*');
		resHdrNew.set('access-control-allow-origin', '*');
		resHdrNew.set('Cache-Control', 'max-age=1500');

		// 删除不必要的头
		resHdrNew.delete('content-security-policy');
		resHdrNew.delete('content-security-policy-report-only');
		resHdrNew.delete('clear-site-data');

		return new Response(res.body, {
			status,
			headers: resHdrNew
		});
	} catch (error) {
		console.error('Proxy fetch error:', error);
		return new Response(JSON.stringify({
			error: 'Proxy fetch failed',
			message: error.message || 'Unknown error'
		}), {
			status: 502,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');	// 将空格、双引号、单引号和换行符替换为逗号
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
} 
