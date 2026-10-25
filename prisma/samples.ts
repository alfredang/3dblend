/** Hand-authored sample specs in the agent's DSL. */
export const SAMPLE_SPECS: { prompt: string; likes: number; downloads: number; spec: unknown }[] = [
  {
    prompt: "A desk phone stand for a 75 mm wide phone, angled 65°, with a cable slot in the base",
    likes: 128, downloads: 412,
    spec: {
      name: "Angled Phone Stand",
      description: "A 65° desk stand for phones up to 80 mm wide, with a front lip and a charging-cable slot.",
      units: "mm",
      printNotes: "Print base-down, 20% infill, no supports needed.",
      root: {
        op: "difference",
        children: [
          { op: "union", children: [
            { op: "roundedBox", size: [100, 90, 6], radius: 3 },
            { op: "translate", by: [0, 60, 3], children: [ { op: "rotate", degrees: [-25, 0, 0], children: [ { op: "roundedBox", size: [100, 6, 95], radius: 2 } ] } ] },
            { op: "translate", by: [0, 22, 5], children: [ { op: "roundedBox", size: [100, 8, 14], radius: 2 } ] },
            { op: "translate", by: [10, 36, 5], children: [ { op: "cube", size: [8, 28, 20] } ] },
            { op: "translate", by: [82, 36, 5], children: [ { op: "cube", size: [8, 28, 20] } ] },
          ] },
          { op: "translate", by: [42, 15, -1], children: [ { op: "cube", size: [16, 60, 40] } ] },
        ],
      },
    },
  },
  {
    prompt: "A hexagonal pencil cup with honeycomb cutouts, 80 mm tall",
    likes: 96, downloads: 301,
    spec: {
      name: "Honeycomb Pencil Cup",
      description: "An 80 mm hexagonal cup with a hex-hole lattice on every face and a solid 3 mm floor.",
      units: "mm",
      printNotes: "Print upright. Holes are vertical-wall features so no supports are required.",
      parts: {
        hexHole: { op: "rotate", degrees: [90, 0, 0], children: [ { op: "cylinder", height: 12, radius: 5.5, segments: 6, center: true } ] },
        holeColumn: { op: "repeat", count: 3, step: [0, 0, 20], children: [ { op: "ref", name: "hexHole" } ] },
        faceHoles: { op: "translate", by: [0, -34, 22], children: [
          { op: "union", children: [
            { op: "translate", by: [-11, 0, 0], children: [ { op: "ref", name: "holeColumn" } ] },
            { op: "translate", by: [11, 0, 0], children: [ { op: "ref", name: "holeColumn" } ] },
            { op: "translate", by: [0, 0, 10], children: [ { op: "ref", name: "holeColumn" } ] },
          ] },
        ] },
      },
      root: {
        op: "difference",
        children: [
          { op: "cylinder", height: 80, radius: 40, segments: 6 },
          { op: "translate", by: [0, 0, 3], children: [ { op: "cylinder", height: 80, radius: 36.5, segments: 6 } ] },
          { op: "radial", count: 6, children: [ { op: "rotate", degrees: [0, 0, 30], children: [ { op: "ref", name: "faceHoles" } ] } ] },
        ],
      },
    },
  },
  {
    prompt: "A small succulent planter with drainage holes and a chamfered rim",
    likes: 211, downloads: 688,
    spec: {
      name: "Faceted Planter",
      description: "A 90 mm twelve-sided planter with a tapered body, 2.4 mm walls, drainage holes and a raised foot.",
      units: "mm",
      printNotes: "Print upright, 3 walls, 15% infill. Vase mode also works if you skip the drainage holes.",
      root: {
        op: "difference",
        children: [
          { op: "union", children: [
            { op: "cylinder", height: 70, radius: 36, radiusTop: 45, segments: 12 },
            { op: "cylinder", height: 4, radius: 32, segments: 12 },
          ] },
          { op: "translate", by: [0, 0, 6], children: [ { op: "cylinder", height: 70, radius: 33, radiusTop: 42.5, segments: 12 } ] },
          { op: "radial", count: 5, radius: 14, children: [ { op: "cylinder", height: 20, radius: 3, center: true } ] },
          { op: "cylinder", height: 20, radius: 3, center: true },
        ],
      },
    },
  },
  {
    prompt: "A wall hook for headphones with two countersunk screw holes",
    likes: 74, downloads: 240,
    spec: {
      name: "Headphone Wall Hook",
      description: "A sturdy J-hook with a 60 mm reach, rounded saddle and two countersunk screw holes.",
      units: "mm",
      printNotes: "Print lying on its back plate (as oriented) for strength along the arm; 30% infill.",
      root: {
        op: "difference",
        children: [
          { op: "union", children: [
            { op: "roundedBox", size: [40, 100, 6], radius: 3 },
            { op: "translate", by: [4, 44, 0], children: [ { op: "roundedBox", size: [32, 16, 60], radius: 3 } ] },
            { op: "translate", by: [4, 36, 46], children: [ { op: "roundedBox", size: [32, 24, 14], radius: 3 } ] },
            { op: "translate", by: [20, 36, 60], children: [ { op: "rotate", degrees: [0, 90, 0], children: [ { op: "cylinder", height: 32, radius: 8, center: true } ] } ] },
          ] },
          { op: "translate", by: [20, 15, -1], children: [ { op: "cylinder", height: 10, radius: 2.2 }, { op: "translate", by: [0, 0, 5], children: [ { op: "cylinder", height: 3, radius: 2.2, radiusTop: 4.5 } ] } ] },
          { op: "translate", by: [20, 85, -1], children: [ { op: "cylinder", height: 10, radius: 2.2 }, { op: "translate", by: [0, 0, 5], children: [ { op: "cylinder", height: 3, radius: 2.2, radiusTop: 4.5 } ] } ] },
        ],
      },
    },
  },
  {
    prompt: "A 24-tooth spur gear with a 6 mm bore and a hub",
    likes: 157, downloads: 522,
    spec: {
      name: "Spur Gear 24T",
      description: "A 24-tooth, module 2.5 spur gear (60 mm pitch diameter) with a 6.4 mm bore and 12 mm hub.",
      units: "mm",
      printNotes: "Print flat, 100% infill or 4+ walls for strength. The bore has 0.4 mm clearance for a 6 mm shaft.",
      parts: {
        tooth: { op: "translate", by: [28, 0, 0], children: [ { op: "extrude", polygon: [[0, -3.6], [4.5, -1.8], [5.5, -1], [5.5, 1], [4.5, 1.8], [0, 3.6]], height: 10 } ] },
      },
      root: {
        op: "difference",
        children: [
          { op: "union", children: [
            { op: "cylinder", height: 10, radius: 28.5, segments: 96 },
            { op: "radial", count: 24, children: [ { op: "ref", name: "tooth" } ] },
            { op: "cylinder", height: 16, radius: 12 },
          ] },
          { op: "translate", by: [0, 0, -1], children: [ { op: "cylinder", height: 20, radius: 3.2 } ] },
          { op: "radial", count: 6, radius: 19, children: [ { op: "translate", by: [0, 0, -1], children: [ { op: "cylinder", height: 12, radius: 4 } ] } ] },
        ],
      },
    },
  },
  {
    prompt: "A twisted hex vase, 120 mm tall, suitable for vase mode",
    likes: 302, downloads: 910,
    spec: {
      name: "Twisted Hex Vase",
      description: "A 120 mm hexagonal vase with a 90° twist and a flared mouth; 2 mm walls and a solid base.",
      units: "mm",
      printNotes: "Perfect for spiralise / vase mode with a 0.6 mm nozzle; otherwise 2 walls, no infill.",
      root: {
        op: "difference",
        children: [
          { op: "extrude", polygon: [[35, 0], [17.5, 30.3], [-17.5, 30.3], [-35, 0], [-17.5, -30.3], [17.5, -30.3]], height: 120, twist: 90, scaleTop: 1.25 },
          { op: "translate", by: [0, 0, 3], children: [ { op: "extrude", polygon: [[33, 0], [16.5, 28.6], [-16.5, 28.6], [-33, 0], [-16.5, -28.6], [16.5, -28.6]], height: 120, twist: 90, scaleTop: 1.25 } ] },
        ],
      },
    },
  },
  {
    prompt: `Design a desk pen-and-phone caddy for a home office, printed in PLA on a Bambu Lab A1 with a 0.4 mm nozzle, no supports.

Overall footprint 120 × 80 mm, 10 mm tall base plate with 4 mm rounded vertical corners and a 2 mm chamfer on the top edge so it looks finished.
Back half: a raised block 120 × 38 × 45 mm containing three vertical pen holes, Ø13 mm, spaced 36 mm apart on centres, each 40 mm deep with a flat bottom (so the base stays solid).
Front half: a phone slot 85 mm wide × 13 mm thick, angled 70° from horizontal, cut 18 mm deep into a 120 × 32 × 24 mm block, with an 8 mm wide cable channel running from the bottom of the slot out through the back of the caddy for a charging cable.
Left side: a shallow tray 30 × 70 × 6 mm recess for paper clips, with a 45° sloped front edge.
Walls everywhere at least 2.4 mm. Add 0.3 mm clearance on the phone slot. Keep all overhangs under 45° so it prints clean, flat base down.`,
    likes: 189, downloads: 540,
    spec: {
      name: "Desk Pen & Phone Caddy",
      description: "A 120 × 80 mm desk caddy with three Ø13 mm pen holes, a 70° phone slot with a rear cable channel, and a paper-clip tray; built from a detailed brief.",
      units: "mm",
      printNotes: "Print flat base down on a textured plate, 0.2 mm layers, 15% infill, 3 walls, no supports.",
      parts: {
        penHole: { op: "cylinder", height: 41, radius: 6.5, segments: 48 },
      },
      root: {
        op: "difference",
        children: [
          { op: "union", children: [
            { op: "roundedBox", size: [120, 80, 10], radius: 4 },
            { op: "translate", by: [0, 42, 8], children: [ { op: "roundedBox", size: [120, 38, 37], radius: 4 } ] },
            { op: "translate", by: [34, 2, 8], children: [ { op: "roundedBox", size: [86, 32, 16], radius: 3 } ] },
          ] },
          { op: "translate", by: [24, 61, 5], children: [ { op: "repeat", count: 3, step: [36, 0, 0], children: [ { op: "ref", name: "penHole" } ] } ] },
          { op: "translate", by: [77, 18, 28], children: [ { op: "rotate", degrees: [-20, 0, 0], children: [ { op: "cube", size: [85.6, 13.3, 40], center: true } ] } ] },
          { op: "translate", by: [73, -1, 2], children: [ { op: "cube", size: [8, 82, 7] } ] },
          { op: "translate", by: [3, 5, 4], children: [ { op: "cube", size: [28, 70, 10] } ] },
          { op: "translate", by: [3, 5, 4], children: [ { op: "rotate", degrees: [0, 0, 0], children: [ { op: "cube", size: [28, 4, 10] } ] } ] },
        ],
      },
    },
  },
];
