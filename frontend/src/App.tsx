import { LandingPage } from "@/pages/LandingPage";

/**
 * App — Root application component.
 *
 * Currently renders the marketing landing page at the root route.  When
 * authentication and the product dashboard are built in later phases, a
 * router will be introduced here to handle multiple routes.
 */
function App() {
  return <LandingPage />;
}

export default App;
