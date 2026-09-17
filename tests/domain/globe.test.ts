import { describe, expect, it } from "vitest";

import { deskFor, graticule, project, slugFor } from "@/lib/domain/globe";

describe("project (orthographic)", () => {
  const center = { lat: 0, lon: 0 };

  it("maps the centre of view to the middle of the disc, facing the viewer", () => {
    expect(project({ lat: 0, lon: 0 }, center, 100)).toEqual({ x: 0, y: 0, visible: true });
  });

  it("puts east to the right and north up", () => {
    const east = project({ lat: 0, lon: 90 }, center, 100);
    const north = project({ lat: 90, lon: 0 }, center, 100);
    expect(east.x).toBeCloseTo(100);
    expect(east.y).toBeCloseTo(0);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(-100);
  });

  it("culls the far hemisphere", () => {
    expect(project({ lat: 0, lon: 180 }, center, 100).visible).toBe(false);
    expect(project({ lat: 0, lon: 91 }, center, 100).visible).toBe(false);
    expect(project({ lat: 0, lon: 89 }, center, 100).visible).toBe(true);
  });

  it("honours the centre of view", () => {
    const santiago = { lat: -33.45, lon: -70.67 };
    const p = project(santiago, santiago, 100);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.visible).toBe(true);
  });
});

describe("graticule", () => {
  it("emits only the visible arcs as path segments, never a line across the back", () => {
    const paths = graticule({ lat: 0, lon: 0 }, 100, 30);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(d.startsWith("M")).toBe(true);
      // Every coordinate must lie inside the disc.
      for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(100.01);
      }
    }
  });
});

describe("deskFor", () => {
  it("places the desks of wire services and papers we know", () => {
    expect(deskFor("Reuters")?.city).toBe("London");
    expect(deskFor("La Tercera")?.city).toBe("Santiago");
    expect(deskFor("Random Substack")).toBeNull();
  });
});

describe("slugFor", () => {
  it("writes a wire slug: TOPIC/HEADLINE-WORDS in caps, stopwords dropped, capped", () => {
    expect(slugFor("Chilean lithium", "Chile lithium output hits a record as prices rebound")).toBe("CHILEAN-LITHIUM/CHILE-OUTPUT-HITS-RECORD");
    expect(slugFor("Rust", "Announcing Rust 1.99")).toBe("RUST/ANNOUNCING-1-99");
  });
  it("never emits an empty right-hand side", () => {
    expect(slugFor("Rust", "")).toBe("RUST/UNTITLED");
  });
});

describe("deskFor — showcase outlets", () => {
  it("places the outlets that actually turn up on the sheet", () => {
    expect(deskFor("BNamericas")?.city).toBe("Santiago");
    expect(deskFor("USA Today")?.city).toBe("Washington");
    expect(deskFor("Space.com")?.city).toBe("New York");
    expect(deskFor("chinadaily.com.cn")?.city).toBe("Beijing");
    expect(deskFor("The Florida Times-Union")?.city).toBe("Jacksonville");
  });
});
