/* =========================================================
   Sidebar navigation: brand, grouped links, collapse.
   Route table lives here; router.js consumes it.
   ========================================================= */

import { icon } from "./icons.js";

export const NAV = [
    { id: "dashboard", path: "#/dashboard", label: "Dashboard", icon: "dashboard", title: "Dashboard", group: "Workspace" },
    { id: "calculator", path: "#/calculator", label: "Calculator", icon: "calculator", title: "Calculator", group: "Workspace" },
    { id: "comparison", path: "#/comparison", label: "Comparison", icon: "compare", title: "Model Comparison", group: "Workspace" },
    { id: "suggestions", path: "#/suggestions", label: "Suggestions", icon: "suggest", title: "Suggestions", group: "Insights" },
    { id: "report", path: "#/report", label: "Report", icon: "reports", title: "Cost Report", group: "Insights" },
    { id: "settings", path: "#/settings", label: "Settings", icon: "settings", title: "Settings", group: "System" },
    { id: "guide", path: "#/guide", label: "Guide", icon: "doc", title: "User Guide", group: "System" },
    { id: "help", path: "#/help", label: "Help", icon: "help", title: "Help", group: "System" }
];

function linkHtml(item, activeId) {
    const active = item.id === activeId;
    return `
        <a href="${item.path}" class="side-link${active ? " active" : ""}"
           data-tip="${item.label}"${active ? ' aria-current="page"' : ""}>
            ${icon(item.icon)}
            <span class="side-label">${item.label}</span>
        </a>`;
}

export function renderSidebar(activeId) {
    let links = "";
    let lastGroup = null;
    NAV.forEach((item) => {
        if (item.group !== lastGroup) {
            lastGroup = item.group;
            links += `<p class="side-group" aria-hidden="true">${item.group}</p>`;
        }
        links += linkHtml(item, activeId);
    });
    return `
        <div class="brand">
            <img class="brand-logo" src="logo.png" alt="">
            <div class="brand-text">
                <strong>AI Cost Monitor</strong>
                <small>Token · Cost · Compare</small>
            </div>
        </div>
        <nav class="side-nav" aria-label="Primary">${links}</nav>
        <div class="side-foot">
            <div class="side-version" aria-hidden="true">V3 · Local-first</div>
        </div>`;
}

export function setActiveLink(activeId) {
    document.querySelectorAll(".side-link[href^='#/']").forEach((link) => {
        const isActive = link.getAttribute("href") === `#/${activeId}`;
        link.classList.toggle("active", isActive);
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}
