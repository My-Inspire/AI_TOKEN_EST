/* =========================================================
   Tiny hash router. One view at a time; legacy single-page
   anchors redirect to their view equivalent.
   ========================================================= */

import { NAV, setActiveLink } from "../components/sidebar.js";
import { setViewTitle } from "../components/topbar.js";

/* Legacy #section anchors → new routes. */
const LEGACY_REDIRECTS = {
    "#calculator": "#/calculator",
    "#comparison": "#/comparison",
    "#scenarios": "#/report",
    "#insights": "#/dashboard"
};

const loaders = {
    dashboard: () => import("../features/dashboard.js"),
    calculator: () => import("../features/calculator.js"),
    comparison: () => import("../features/comparison.js"),
    suggestions: () => import("../features/suggestions.js"),
    report: () => import("../features/report.js"),
    settings: () => import("../features/settings.js"),
    guide: () => import("../features/guide.js"),
    help: () => import("../features/help.js")
};

function resolveRoute() {
    const hash = window.location.hash || "#/dashboard";
    if (LEGACY_REDIRECTS[hash]) return { redirect: LEGACY_REDIRECTS[hash] };
    const id = hash.replace(/^#\//, "");
    if (loaders[id]) return { id };
    return { id: "dashboard" };
}

function focusMain() {
    const main = document.getElementById("view");
    if (!main) return;
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
}

export async function renderRoute() {
    const resolved = resolveRoute();
    if (resolved.redirect) {
        window.location.hash = resolved.redirect;
        return;
    }
    const { id } = resolved;
    const outlet = document.getElementById("view");
    if (!outlet) return;

    document.querySelector(".shell")?.classList.remove("nav-open");
    setActiveLink(id);

    const meta = NAV.find((n) => n.id === id);
    setViewTitle(meta ? meta.title : "Dashboard");

    outlet.classList.remove("view-enter");
    try {
        const module = await loaders[id]();
        outlet.innerHTML = module.render();
        module.mount?.(outlet);
    } catch (error) {
        console.error(`Failed to load view "${id}"`, error);
        outlet.innerHTML = `
            <div class="view-head"><p class="card-eyebrow">Error</p><h2>View failed to load</h2></div>
            <div class="panel"><p>Something went wrong loading this section. <a href="#/dashboard">Back to Dashboard</a>.</p></div>`;
    }
    void outlet.offsetWidth;
    outlet.classList.add("view-enter");
    focusMain();
}

export function initRouter() {
    window.addEventListener("hashchange", renderRoute);
    renderRoute();
}
