"""Pixel-level regressions against the real mock renderer on Linux."""
import unittest
from PIL import ImageChops, Image, ImageDraw
from preview import frame


class DisplayTests(unittest.TestCase):
    def test_safe_disc(self):
        # A different solid color at the panel edge would be visible here.
        mask = Image.new('L', (240, 240), 255)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((12, 12, 228, 228), fill=0)
        blank = frame(0, 0)
        for language in range(3):
            for screen in range(6):
                for profile in range(5):
                    for state in (range(12) if screen == 0 else [2, 5]):
                        with self.subTest(screen=screen, profile=profile, state=state,
                                          language=language):
                            im = frame(screen, state, profile, language=language)
                            diff = ImageChops.difference(blank, im)
                            self.assertIsNone(Image.composite(diff, Image.new('RGB', im.size), mask).getbbox())
                            self.assertGreater(len(im.getcolors()), 5)

    def test_expressions(self):
        faces = [frame(0, s, quiet=1).crop((28, 59, 211, 153)).tobytes() for s in range(12)]
        self.assertEqual(len(set(faces)), 12)

    def test_quiet_and_motion(self):
        for screen in range(6):
            self.assertEqual(frame(screen, 2, quiet=1).tobytes(),
                             frame(screen, 2, quiet=1, time=3800).tobytes())
        self.assertNotEqual(frame(0, 2, age=0).tobytes(), frame(0, 2, age=240).tobytes())
        self.assertNotEqual(frame(4, 2).tobytes(), frame(4, 2, time=3800).tobytes())

    def test_missing_and_extreme_profiles(self):
        for screen in range(1, 5):
            self.assertNotEqual(frame(screen, 2, 1).tobytes(), frame(screen, 2, 2).tobytes())

    def test_languages_change_all_dashboards(self):
        for language in (1, 2):
            for screen in range(6):
                with self.subTest(screen=screen, language=language):
                    self.assertNotEqual(frame(screen, 2, language=language).tobytes(),
                                        frame(screen, 2).tobytes())

    def test_mcp_subset_and_statuses(self):
        # 12 configured servers, 8 details, every status class on the radar.
        stress = frame(4, 2, 4)
        self.assertNotEqual(stress.tobytes(), frame(4, 2, 0).tobytes())
        for language in (1, 2):
            self.assertNotEqual(frame(4, 2, 4, language=language).tobytes(),
                                frame(4, 2, 4).tobytes())

    def test_offline_and_live_footer(self):
        # The System screen exposes the degraded bridge and the offline OpenCode
        # peer, so it must differ from the healthy fixture.
        self.assertNotEqual(frame(5, 0, 3).tobytes(), frame(5, 0, 0).tobytes())
        self.assertNotEqual(frame(0, 2, 6).tobytes(), frame(0, 2, 0).tobytes())
        self.assertNotEqual(frame(5, 0, 1).tobytes(), frame(5, 2, 2).tobytes())

    def test_native_resolution(self):
        for screen in range(6):
            for language in range(3):
                self.assertEqual(frame(screen, 2, language=language).size, (240, 240))


if __name__ == '__main__':
    unittest.main()
