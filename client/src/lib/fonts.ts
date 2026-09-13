/** Non-render-blocking stylesheet; optional font display avoids a late font swap. */
export function loadOptionalFonts() {
  if (document.getElementById("cinebite-fonts")) return;
  const link = document.createElement("link");
  link.id = "cinebite-fonts";
  link.rel = "stylesheet";
  link.media = "print";
  link.referrerPolicy = "no-referrer";
  link.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=optional";
  link.onload = () => { link.media = "all"; link.onload = null; };
  document.head.appendChild(link);
}
