import { Box, Button, Container, Typography } from "@mui/material";

import { CoffeeCup } from "../../components/CoffeeCup.js";

export const MenuHero = () => (
  <Box
    component="section"
    aria-labelledby="menu-welcome"
    sx={{
      borderBottom: "1px solid",
      borderColor: "divider",
      background: "linear-gradient(135deg, #fffaf1, #f5e9d7)",
    }}
  >
    <Container
      maxWidth="lg"
      sx={{
        display: "flex",
        flexDirection: { xs: "column-reverse", sm: "row" },
        alignItems: "center",
        justifyContent: "space-between",
        gap: { xs: 0, sm: 3 },
        py: { xs: 2.5, sm: 5, md: 7 },
        textAlign: { xs: "center", sm: "left" },
      }}
    >
      <Box>
        <Typography
          variant="overline"
          sx={{ color: "primary.main", fontWeight: 800, letterSpacing: ".12em" }}
        >
          A little South Indian comfort
        </Typography>
        <Typography
          id="menu-welcome"
          component="h1"
          variant="h2"
          sx={{ mt: 1, fontSize: { xs: "2.1rem", sm: "3rem", md: "4.4rem" }, lineHeight: 1.08 }}
        >
          Freshly brewed.
          <Box component="span" sx={{ display: "block", color: "primary.main" }}>
            Ready when you are.
          </Box>
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 440 }}>
          Your favourite kaapi, breakfast &amp; snacks. Order here, pick up at the shop.
        </Typography>
        <Button component="a" href="#menu-results" variant="contained" sx={{ mt: 2 }}>
          Explore the menu
        </Button>
      </Box>
      <Box
        sx={{
          flexShrink: 0,
          width: { xs: 132, sm: 210, md: 280 },
          "& svg": { display: "block", width: "100%", height: "auto" },
        }}
      >
        <CoffeeCup />
      </Box>
    </Container>
  </Box>
);
