"""24x24 authoring canvas for the pixel passive item icons.

Icons are DRAWN, not typed: a shape gets laid down in a base tone and then a
single shared pass puts the shadow on its lower-right edge and the highlight on
its upper-left. That pass is the whole reason this file exists - it is what
makes sixty-five icons look like one set instead of sixty-five decisions about
where the light is.

Tones, matching pixelPalette() in js/pixelicons.js:
  .  empty     1  shadow      3  energy / the active, lit thing
  0  outline   2  structure   4  pale accent (generated, never authored)
The outline is generated in JS from the silhouette, so nothing here draws one.
"""
import math

G = 24
EMPTY = '.'
STRUCT, SHADOW, ENERGY, PALE = '2', '1', '3', '4'


class Canvas:
    def __init__(self):
        self.g = [[EMPTY] * G for _ in range(G)]

    # ---- primitives ------------------------------------------------------
    def put(self, x, y, t):
        if 0 <= x < G and 0 <= y < G:
            self.g[int(y)][int(x)] = t

    def rect(self, x0, y0, x1, y1, t):
        for y in range(int(math.ceil(y0)), int(math.floor(y1)) + 1):
            for x in range(int(math.ceil(x0)), int(math.floor(x1)) + 1):
                self.put(x, y, t)

    def _scan(self, inside, t):
        for y in range(G):
            for x in range(G):
                if inside(x + 0.5, y + 0.5):
                    self.put(x, y, t)

    def disc(self, cx, cy, r, t):
        self._scan(lambda px, py: math.hypot(px - cx, py - cy) <= r, t)

    def ring(self, cx, cy, r, w, t):
        self._scan(lambda px, py: r - w <= math.hypot(px - cx, py - cy) <= r, t)

    def arc(self, cx, cy, r, w, a0, a1, t):
        """Angles in degrees, 0 = right, counter-clockwise on screen."""
        def inside(px, py):
            d = math.hypot(px - cx, py - cy)
            if not (r - w <= d <= r):
                return False
            a = math.degrees(math.atan2(cy - py, px - cx)) % 360
            lo, hi = a0 % 360, a1 % 360
            return lo <= a <= hi if lo <= hi else (a >= lo or a <= hi)
        self._scan(inside, t)

    def line(self, x0, y0, x1, y1, t, w=1.0):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy or 1e-9

        def inside(px, py):
            s = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
            return math.hypot(px - (x0 + s * dx), py - (y0 + s * dy)) <= w / 2
        self._scan(inside, t)

    def poly(self, pts, t):
        def inside(px, py):
            hit = False
            n = len(pts)
            for i in range(n):
                (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
                if (ay > py) != (by > py):
                    if px < ax + (py - ay) / (by - ay) * (bx - ax):
                        hit = not hit
            return hit
        self._scan(inside, t)

    def blit(self, rows, ox, oy):
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch != EMPTY:
                    self.put(ox + i, oy + j, ch)

    def erase(self, inside):
        for y in range(G):
            for x in range(G):
                if inside(x + 0.5, y + 0.5):
                    self.g[y][x] = EMPTY

    def recolor(self, frm, to):
        for y in range(G):
            for x in range(G):
                if self.g[y][x] == frm:
                    self.g[y][x] = to

    # ---- the shared lighting pass ---------------------------------------
    def shade(self, base, shadow, light=None):
        """Light from the upper left, on every icon, without exception.

        A pixel of `base` on the shape's lower-right edge becomes `shadow`; one
        on the upper-left edge becomes `light`. Edges are measured against the
        WHOLE silhouette, not just this shape, so a part tucked behind another
        part is not lit as though it were out in the open.
        """
        src = [r[:] for r in self.g]
        out = lambda x, y: not (0 <= x < G and 0 <= y < G) or src[y][x] == EMPTY
        for y in range(G):
            for x in range(G):
                if src[y][x] != base:
                    continue
                if out(x + 1, y) or out(x, y + 1) or out(x + 1, y + 1):
                    self.g[y][x] = shadow
                elif light and (out(x - 1, y) or out(x, y - 1) or out(x - 1, y - 1)):
                    self.g[y][x] = light

    def rows(self):
        return [''.join(r) for r in self.g]

    def show(self):
        for i, r in enumerate(self.rows()):
            print('%2d %s' % (i, r))
