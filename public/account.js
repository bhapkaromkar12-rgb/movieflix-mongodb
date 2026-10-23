"use strict";
const token = localStorage.getItem("nextmovie_token") || "";
const savedUser = JSON.parse(localStorage.getItem("nextmovie_user") || "null");
const $ = (id) => document.getElementById(id);
const headers = { Authorization: `Bearer ${token}` };
function escapeHTML(value = "") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function price(cents, currency) { try { const code=String(currency||"usd").toUpperCase(); const digits=new Intl.NumberFormat(undefined,{style:"currency",currency:code}).resolvedOptions().maximumFractionDigits; return new Intl.NumberFormat(undefined,{style:"currency",currency:code}).format(Number(cents||0)/(10**digits)); } catch { return `${Number(cents||0)} ${String(currency||"usd").toUpperCase()}`; } }
function requireLogin() { if (!token || !savedUser || savedUser.role !== "user") { location.replace(`/auth.html?next=${encodeURIComponent("/account.html")}`); return false; } return true; }
async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers||{}) } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed."); return data; }
function empty(message) { return `<p class="muted-text account-empty">${escapeHTML(message)}</p>`; }
function showNotice(message, kind = "info") { const el = $("paymentNotice"); el.hidden = false; el.className = `payment-notice ${kind}`; el.textContent = message; }
async function loadLibrary() {
  const items = await api("/api/account/library");
  $("libraryCount").textContent = `${items.length} ${items.length === 1 ? "movie" : "movies"}`;
  $("libraryGrid").innerHTML = items.length ? items.map(item => `<article class="account-movie"><img src="${escapeHTML(item.movie.poster || "https://placehold.co/150x220/171b24/c4f56a?text=Movie")}" alt="${escapeHTML(item.movie.title)} poster" loading="lazy"><div class="account-movie-copy"><span class="account-badge">OWNED · ${escapeHTML(price(item.amountCents,item.currency))}</span><h3>${escapeHTML(item.movie.title)}</h3><p>${escapeHTML(item.movie.year || "")} · ${escapeHTML(item.movie.genre || "Movie")}</p><small>Purchased ${new Date(item.purchasedAt).toLocaleDateString()}</small><button class="primary-btn" type="button" data-download="${escapeHTML(item.movie._id)}">⬇ Download movie</button></div></article>`).join("") : empty("Your purchased downloads will appear here.");
}
async function loadWishlist() {
  const items = await api("/api/account/wishlist");
  $("wishlistCount").textContent = `${items.length} saved`;
  $("wishlistGrid").innerHTML = items.length ? items.map(movie => `<article class="account-movie wishlist-movie"><img src="${escapeHTML(movie.poster || "https://placehold.co/150x220/171b24/c4f56a?text=Movie")}" alt="${escapeHTML(movie.title)} poster" loading="lazy"><div class="account-movie-copy"><span class="account-badge">WATCHLIST</span><h3>${escapeHTML(movie.title)}</h3><p>${escapeHTML(movie.year || "")} · ${escapeHTML(movie.genre || "Movie")}</p><a class="account-action" href="/#movies">View in catalogue</a><button class="secondary-btn" type="button" data-remove="${escapeHTML(movie._id)}">Remove</button></div></article>`).join("") : empty("Save titles from the catalogue and they’ll appear here.");
}
async function loadAccount() {
  if (!requireLogin()) return;
  $("accountWelcome").textContent = `Welcome back, ${savedUser?.name || "movie fan"}. Your purchases and saved movies are here.`;
  try { await Promise.all([loadLibrary(), loadWishlist()]); }
  catch (error) { showNotice(error.message, "error"); $("libraryGrid").innerHTML = empty("Connect MongoDB to load your account library."); $("wishlistGrid").innerHTML = empty("Connect MongoDB to load your watchlist."); }
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session_id");
  if (params.get("payment") === "success" && sessionId) {
    try {
      const result = await api(`/api/payments/confirm/${encodeURIComponent(sessionId)}`);
      showNotice(result.paid ? "Payment confirmed. Your movie is ready in the library." : "Payment is still processing. Refresh this page in a moment.", result.paid ? "success" : "info");
      if (result.paid) await loadLibrary();
    } catch (error) { showNotice(error.message, "error"); }
    history.replaceState({}, "", "/account.html");
  }
}
document.addEventListener("click", async (event) => {
  const download = event.target.closest("[data-download]");
  if (download) {
    download.disabled = true;
    try { const result = await api(`/api/movies/${encodeURIComponent(download.dataset.download)}/download`); location.assign(result.downloadUrl); }
    catch (error) { showNotice(error.message, "error"); download.disabled = false; }
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    remove.disabled = true;
    try { await api(`/api/account/wishlist/${encodeURIComponent(remove.dataset.remove)}`, { method: "DELETE" }); await loadWishlist(); }
    catch (error) { showNotice(error.message, "error"); remove.disabled = false; }
  }
});
$("logoutBtn").addEventListener("click", () => { localStorage.removeItem("nextmovie_token"); localStorage.removeItem("nextmovie_user"); location.href = "/"; });
loadAccount();
