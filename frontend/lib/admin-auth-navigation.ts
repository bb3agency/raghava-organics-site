/** Hard navigation — reliable when leaving /admin (soft router.replace can stall). */
export function redirectToAdminLogin(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.location.assign("/admin/login");
}

export function redirectToAdminHome(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.location.assign("/admin");
}
