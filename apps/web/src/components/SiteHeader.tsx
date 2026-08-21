import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import { AppBar, Box, Chip, Container, Toolbar, Typography } from "@mui/material";

import { environment } from "../config/environment.js";

export const SiteHeader = () => (
  <AppBar
    position="static"
    elevation={0}
    color="transparent"
    sx={{ borderBottom: "1px solid", borderColor: "rgba(91, 50, 29, 0.12)" }}
  >
    <Container maxWidth="lg">
      <Toolbar disableGutters sx={{ minHeight: { xs: 72, md: 82 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "common.white",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            <CoffeeRoundedIcon />
          </Box>
          <Typography
            variant="h6"
            component="span"
            noWrap
            sx={{ fontWeight: 850, letterSpacing: "-0.025em" }}
          >
            {environment.shopName}
          </Typography>
        </Box>
        <Chip
          label="Pickup · Pay at shop"
          size="small"
          sx={{
            ml: "auto",
            bgcolor: "rgba(184, 95, 22, 0.1)",
            color: "secondary.dark",
            fontWeight: 750,
            display: { xs: "none", sm: "flex" },
          }}
        />
      </Toolbar>
    </Container>
  </AppBar>
);
