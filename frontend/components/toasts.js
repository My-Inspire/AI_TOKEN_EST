/* =========================================================
   Toast notifications (aria-live polite).
   ========================================================= */

export function showToast(message, type = "success") {
    let container = document.getElementById("toasts");
    if (!container) {
        container = document.createElement("div");
        container.id = "toasts";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("toast-hide");
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}
