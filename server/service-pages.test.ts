import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import ServiceInfo, { servicePages } from "../client/src/pages/ServiceInfo";
import { CHECKOUT_POLICIES } from "../shared/consent";

describe("service information pages", () => {
  for (const [path, page] of Object.entries(servicePages)) {
    it(`renders ${path} with support and tracking links`, () => {
      const html = renderToStaticMarkup(createElement(Router, { ssrPath: path }, createElement(ServiceInfo)));
      expect(html).toContain(page.title.replaceAll("&", "&amp;"));
      expect(html).not.toContain("9776600696");
      expect(html).toContain('href="/support"');
      expect(html).toContain('href="/track"');
    });
  }
  it("every checkout notice resolves to an implemented policy", () => {
    for (const policy of CHECKOUT_POLICIES) expect(servicePages[policy.href]).toBeDefined();
  });
});
