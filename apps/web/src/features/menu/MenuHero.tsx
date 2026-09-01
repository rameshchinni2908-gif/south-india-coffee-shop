import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import LocalCafeRoundedIcon from "@mui/icons-material/LocalCafeRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import { Box, Container, Stack, Typography } from "@mui/material";

const highlights = [
  { icon: <LocalCafeRoundedIcon />, label: "Fresh decoction" },
  { icon: <SpaRoundedIcon />, label: "Vegetarian favourites" },
  { icon: <AccessTimeRoundedIcon />, label: "Easy pickup" },
];

export const MenuHero = () => (
  <Box
    component="section"
    sx={{
      position: "relative",
      overflow: "hidden",
      isolation: "isolate",
      borderBottom: "1px solid",
      borderColor: "rgba(91, 50, 29, 0.12)",
      background:
        "radial-gradient(circle at 84% 15%, rgba(217, 132, 61, 0.24), transparent 24%), linear-gradient(135deg, #fffaf1 0%, #f5e9d7 100%)",
    }}
  >
    <Box
      aria-hidden="true"
      className="hero-orbit"
      sx={{
        position: "absolute",
        width: 280,
        height: 280,
        right: { xs: -170, md: 40 },
        bottom: -160,
        border: "42px solid rgba(111, 50, 25, 0.07)",
        borderRadius: "50%",
        animation: "soft-float 7s ease-in-out infinite",
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    />
    <Container
      maxWidth="lg"
      sx={{ position: "relative", zIndex: 1, py: { xs: 5.5, sm: 7, md: 10 } }}
    >
      <Typography
        variant="overline"
        sx={{
          color: "secondary.dark",
          fontWeight: 850,
          letterSpacing: "0.16em",
          animation: "hero-enter 480ms ease both",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        South Indian comfort, made fresh
      </Typography>
      <Typography
        component="h1"
        variant="h2"
        sx={{
          mt: 1.5,
          maxWidth: 790,
          animation: "hero-enter 540ms 70ms ease both",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        Freshly brewed.
        <Box component="span" sx={{ display: "block", color: "primary.main" }}>
          Ready when you are.
        </Box>
      </Typography>
      <Typography
        variant="h6"
        component="p"
        color="text.secondary"
        sx={{
          mt: { xs: 2.25, sm: 3 },
          maxWidth: 620,
          lineHeight: 1.65,
          fontWeight: 450,
          fontSize: { xs: "1rem", sm: "1.25rem" },
          animation: "hero-enter 540ms 140ms ease both",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        Browse aromatic coffee, wholesome breakfast, tea-time snacks, and pantry favourites prepared
        for pickup.
      </Typography>
      <Stack
        direction="row"
        useFlexGap
        spacing={{ xs: 1.5, sm: 3 }}
        sx={{
          mt: { xs: 3, sm: 4 },
          flexWrap: "wrap",
          animation: "hero-enter 540ms 210ms ease both",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {highlights.map((highlight) => (
          <Stack
            key={highlight.label}
            direction="row"
            spacing={0.8}
            sx={{
              color: "primary.dark",
              alignItems: "center",
              px: { xs: 1.2, sm: 0 },
              py: { xs: 0.7, sm: 0 },
              borderRadius: 999,
              bgcolor: { xs: "rgba(255, 253, 248, 0.72)", sm: "transparent" },
              border: { xs: "1px solid rgba(111, 50, 25, 0.1)", sm: "none" },
            }}
          >
            {highlight.icon}
            <Typography variant="body2" sx={{ fontWeight: 750 }}>
              {highlight.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Container>
  </Box>
);
