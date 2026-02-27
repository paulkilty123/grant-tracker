"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/auth/callback/route";
exports.ids = ["app/auth/callback/route"];
exports.modules = {

/***/ "../../client/components/action-async-storage.external":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "../../client/components/request-async-storage.external":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "../../client/components/static-generation-async-storage.external":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fauth%2Fcallback%2Froute&page=%2Fauth%2Fcallback%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fcallback%2Froute.ts&appDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fauth%2Fcallback%2Froute&page=%2Fauth%2Fcallback%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fcallback%2Froute.ts&appDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_paulkilty_Documents_grant_tracker_src_app_auth_callback_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/auth/callback/route.ts */ \"(rsc)/./src/app/auth/callback/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/auth/callback/route\",\n        pathname: \"/auth/callback\",\n        filename: \"route\",\n        bundlePath: \"app/auth/callback/route\"\n    },\n    resolvedPagePath: \"/Users/paulkilty/Documents/grant-tracker/src/app/auth/callback/route.ts\",\n    nextConfigOutput,\n    userland: _Users_paulkilty_Documents_grant_tracker_src_app_auth_callback_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/auth/callback/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhdXRoJTJGY2FsbGJhY2slMkZyb3V0ZSZwYWdlPSUyRmF1dGglMkZjYWxsYmFjayUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmF1dGglMkZjYWxsYmFjayUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRnBhdWxraWx0eSUyRkRvY3VtZW50cyUyRmdyYW50LXRyYWNrZXIlMkZzcmMlMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRlVzZXJzJTJGcGF1bGtpbHR5JTJGRG9jdW1lbnRzJTJGZ3JhbnQtdHJhY2tlciZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7O0FBQXNHO0FBQ3ZDO0FBQ2M7QUFDdUI7QUFDcEc7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLGdIQUFtQjtBQUMzQztBQUNBLGNBQWMseUVBQVM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBLFlBQVk7QUFDWixDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0EsUUFBUSxpRUFBaUU7QUFDekU7QUFDQTtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUN1SDs7QUFFdkgiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9ncmFudC10cmFja2VyLz8xNDU4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcFJvdXRlUm91dGVNb2R1bGUgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9mdXR1cmUvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9mdXR1cmUvcm91dGUta2luZFwiO1xuaW1wb3J0IHsgcGF0Y2hGZXRjaCBhcyBfcGF0Y2hGZXRjaCB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2xpYi9wYXRjaC1mZXRjaFwiO1xuaW1wb3J0ICogYXMgdXNlcmxhbmQgZnJvbSBcIi9Vc2Vycy9wYXVsa2lsdHkvRG9jdW1lbnRzL2dyYW50LXRyYWNrZXIvc3JjL2FwcC9hdXRoL2NhbGxiYWNrL3JvdXRlLnRzXCI7XG4vLyBXZSBpbmplY3QgdGhlIG5leHRDb25maWdPdXRwdXQgaGVyZSBzbyB0aGF0IHdlIGNhbiB1c2UgdGhlbSBpbiB0aGUgcm91dGVcbi8vIG1vZHVsZS5cbmNvbnN0IG5leHRDb25maWdPdXRwdXQgPSBcIlwiXG5jb25zdCByb3V0ZU1vZHVsZSA9IG5ldyBBcHBSb3V0ZVJvdXRlTW9kdWxlKHtcbiAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIGtpbmQ6IFJvdXRlS2luZC5BUFBfUk9VVEUsXG4gICAgICAgIHBhZ2U6IFwiL2F1dGgvY2FsbGJhY2svcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2F1dGgvY2FsbGJhY2tcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXV0aC9jYWxsYmFjay9yb3V0ZVwiXG4gICAgfSxcbiAgICByZXNvbHZlZFBhZ2VQYXRoOiBcIi9Vc2Vycy9wYXVsa2lsdHkvRG9jdW1lbnRzL2dyYW50LXRyYWNrZXIvc3JjL2FwcC9hdXRoL2NhbGxiYWNrL3JvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgcmVxdWVzdEFzeW5jU3RvcmFnZSwgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuY29uc3Qgb3JpZ2luYWxQYXRobmFtZSA9IFwiL2F1dGgvY2FsbGJhY2svcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fauth%2Fcallback%2Froute&page=%2Fauth%2Fcallback%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fcallback%2Froute.ts&appDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/auth/callback/route.ts":
/*!****************************************!*\
  !*** ./src/app/auth/callback/route.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET)\n/* harmony export */ });\n/* harmony import */ var _lib_supabase_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @/lib/supabase/server */ \"(rsc)/./src/lib/supabase/server.ts\");\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n\n\nasync function GET(request) {\n    const { searchParams, origin } = new URL(request.url);\n    const code = searchParams.get(\"code\");\n    const next = searchParams.get(\"next\") ?? \"/dashboard\";\n    if (code) {\n        const supabase = await (0,_lib_supabase_server__WEBPACK_IMPORTED_MODULE_0__.createClient)();\n        const { error } = await supabase.auth.exchangeCodeForSession(code);\n        if (!error) {\n            return next_server__WEBPACK_IMPORTED_MODULE_1__.NextResponse.redirect(`${origin}${next}`);\n        }\n    }\n    return next_server__WEBPACK_IMPORTED_MODULE_1__.NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2F1dGgvY2FsbGJhY2svcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQW9EO0FBQ1Y7QUFFbkMsZUFBZUUsSUFBSUMsT0FBZ0I7SUFDeEMsTUFBTSxFQUFFQyxZQUFZLEVBQUVDLE1BQU0sRUFBRSxHQUFHLElBQUlDLElBQUlILFFBQVFJLEdBQUc7SUFDcEQsTUFBTUMsT0FBT0osYUFBYUssR0FBRyxDQUFDO0lBQzlCLE1BQU1DLE9BQU9OLGFBQWFLLEdBQUcsQ0FBQyxXQUFXO0lBRXpDLElBQUlELE1BQU07UUFDUixNQUFNRyxXQUFXLE1BQU1YLGtFQUFZQTtRQUNuQyxNQUFNLEVBQUVZLEtBQUssRUFBRSxHQUFHLE1BQU1ELFNBQVNFLElBQUksQ0FBQ0Msc0JBQXNCLENBQUNOO1FBQzdELElBQUksQ0FBQ0ksT0FBTztZQUNWLE9BQU9YLHFEQUFZQSxDQUFDYyxRQUFRLENBQUMsQ0FBQyxFQUFFVixPQUFPLEVBQUVLLEtBQUssQ0FBQztRQUNqRDtJQUNGO0lBRUEsT0FBT1QscURBQVlBLENBQUNjLFFBQVEsQ0FBQyxDQUFDLEVBQUVWLE9BQU8scUNBQXFDLENBQUM7QUFDL0UiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9ncmFudC10cmFja2VyLy4vc3JjL2FwcC9hdXRoL2NhbGxiYWNrL3JvdXRlLnRzP2IyOWEiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnQC9saWIvc3VwYWJhc2Uvc2VydmVyJ1xuaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQocmVxdWVzdDogUmVxdWVzdCkge1xuICBjb25zdCB7IHNlYXJjaFBhcmFtcywgb3JpZ2luIH0gPSBuZXcgVVJMKHJlcXVlc3QudXJsKVxuICBjb25zdCBjb2RlID0gc2VhcmNoUGFyYW1zLmdldCgnY29kZScpXG4gIGNvbnN0IG5leHQgPSBzZWFyY2hQYXJhbXMuZ2V0KCduZXh0JykgPz8gJy9kYXNoYm9hcmQnXG5cbiAgaWYgKGNvZGUpIHtcbiAgICBjb25zdCBzdXBhYmFzZSA9IGF3YWl0IGNyZWF0ZUNsaWVudCgpXG4gICAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UuYXV0aC5leGNoYW5nZUNvZGVGb3JTZXNzaW9uKGNvZGUpXG4gICAgaWYgKCFlcnJvcikge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5yZWRpcmVjdChgJHtvcmlnaW59JHtuZXh0fWApXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIE5leHRSZXNwb25zZS5yZWRpcmVjdChgJHtvcmlnaW59L2F1dGgvbG9naW4/ZXJyb3I9Y29uZmlybWF0aW9uX2ZhaWxlZGApXG59XG4iXSwibmFtZXMiOlsiY3JlYXRlQ2xpZW50IiwiTmV4dFJlc3BvbnNlIiwiR0VUIiwicmVxdWVzdCIsInNlYXJjaFBhcmFtcyIsIm9yaWdpbiIsIlVSTCIsInVybCIsImNvZGUiLCJnZXQiLCJuZXh0Iiwic3VwYWJhc2UiLCJlcnJvciIsImF1dGgiLCJleGNoYW5nZUNvZGVGb3JTZXNzaW9uIiwicmVkaXJlY3QiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/app/auth/callback/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/supabase/server.ts":
/*!************************************!*\
  !*** ./src/lib/supabase/server.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createClient: () => (/* binding */ createClient)\n/* harmony export */ });\n/* harmony import */ var _supabase_ssr__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @supabase/ssr */ \"(rsc)/./node_modules/@supabase/ssr/dist/module/index.js\");\n/* harmony import */ var next_headers__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/headers */ \"(rsc)/./node_modules/next/dist/api/headers.js\");\n\n\nasync function createClient() {\n    const cookieStore = await (0,next_headers__WEBPACK_IMPORTED_MODULE_1__.cookies)();\n    return (0,_supabase_ssr__WEBPACK_IMPORTED_MODULE_0__.createServerClient)(\"https://yrndczlqjqtfgissleev.supabase.co\", \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmRjemxxanF0Zmdpc3NsZWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MjgzMjMsImV4cCI6MjA4NzUwNDMyM30.weCGt1gQGiv9EBIuVq55UQoaUycu62PViZSie2vJ_WI\", {\n        cookies: {\n            getAll () {\n                return cookieStore.getAll();\n            },\n            setAll (cookiesToSet) {\n                try {\n                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));\n                } catch  {\n                // Called from a Server Component — cookies can't be set.\n                // Middleware handles session refresh instead.\n                }\n            }\n        }\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3N1cGFiYXNlL3NlcnZlci50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBa0Q7QUFDWjtBQUUvQixlQUFlRTtJQUNwQixNQUFNQyxjQUFjLE1BQU1GLHFEQUFPQTtJQUVqQyxPQUFPRCxpRUFBa0JBLENBQ3ZCSSwwQ0FBb0MsRUFDcENBLGtOQUF5QyxFQUN6QztRQUNFSCxTQUFTO1lBQ1BPO2dCQUNFLE9BQU9MLFlBQVlLLE1BQU07WUFDM0I7WUFDQUMsUUFBT0MsWUFBWTtnQkFDakIsSUFBSTtvQkFDRkEsYUFBYUMsT0FBTyxDQUFDLENBQUMsRUFBRUMsSUFBSSxFQUFFQyxLQUFLLEVBQUVDLE9BQU8sRUFBRSxHQUM1Q1gsWUFBWVksR0FBRyxDQUFDSCxNQUFNQyxPQUFPQztnQkFFakMsRUFBRSxPQUFNO2dCQUNOLHlEQUF5RDtnQkFDekQsOENBQThDO2dCQUNoRDtZQUNGO1FBQ0Y7SUFDRjtBQUVKIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZ3JhbnQtdHJhY2tlci8uL3NyYy9saWIvc3VwYWJhc2Uvc2VydmVyLnRzPzJlOGUiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY3JlYXRlU2VydmVyQ2xpZW50IH0gZnJvbSAnQHN1cGFiYXNlL3NzcidcbmltcG9ydCB7IGNvb2tpZXMgfSBmcm9tICduZXh0L2hlYWRlcnMnXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVDbGllbnQoKSB7XG4gIGNvbnN0IGNvb2tpZVN0b3JlID0gYXdhaXQgY29va2llcygpXG5cbiAgcmV0dXJuIGNyZWF0ZVNlcnZlckNsaWVudChcbiAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVVBBQkFTRV9VUkwhLFxuICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZISxcbiAgICB7XG4gICAgICBjb29raWVzOiB7XG4gICAgICAgIGdldEFsbCgpIHtcbiAgICAgICAgICByZXR1cm4gY29va2llU3RvcmUuZ2V0QWxsKClcbiAgICAgICAgfSxcbiAgICAgICAgc2V0QWxsKGNvb2tpZXNUb1NldCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb29raWVzVG9TZXQuZm9yRWFjaCgoeyBuYW1lLCB2YWx1ZSwgb3B0aW9ucyB9KSA9PlxuICAgICAgICAgICAgICBjb29raWVTdG9yZS5zZXQobmFtZSwgdmFsdWUsIG9wdGlvbnMpXG4gICAgICAgICAgICApXG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBDYWxsZWQgZnJvbSBhIFNlcnZlciBDb21wb25lbnQg4oCUIGNvb2tpZXMgY2FuJ3QgYmUgc2V0LlxuICAgICAgICAgICAgLy8gTWlkZGxld2FyZSBoYW5kbGVzIHNlc3Npb24gcmVmcmVzaCBpbnN0ZWFkLlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfVxuICApXG59XG4iXSwibmFtZXMiOlsiY3JlYXRlU2VydmVyQ2xpZW50IiwiY29va2llcyIsImNyZWF0ZUNsaWVudCIsImNvb2tpZVN0b3JlIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX1VSTCIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZIiwiZ2V0QWxsIiwic2V0QWxsIiwiY29va2llc1RvU2V0IiwiZm9yRWFjaCIsIm5hbWUiLCJ2YWx1ZSIsIm9wdGlvbnMiLCJzZXQiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/supabase/server.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/@supabase","vendor-chunks/next","vendor-chunks/tslib","vendor-chunks/iceberg-js","vendor-chunks/cookie"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fauth%2Fcallback%2Froute&page=%2Fauth%2Fcallback%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fcallback%2Froute.ts&appDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fpaulkilty%2FDocuments%2Fgrant-tracker&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();