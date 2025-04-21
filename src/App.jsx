import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LazyLoad from "react-lazyload";
import Ai from "./pages/Ai";

// Lazy loading components
const Hero = lazy(() => import("./components/hero/Hero"));
const Services = lazy(() => import("./components/services/Services"));

// Home component for the "/" route
const Home = () => {
  return (
    <div className="container">
      <Suspense fallback={"loading..."}>
        <LazyLoad height={"100vh"} offset={-100}>
          <section id="home">
            <Hero />
          </section>
        </LazyLoad>
      </Suspense>
      <Suspense fallback={"loading..."}>
        <LazyLoad height={"100vh"} offset={-100}>
          <section id="services">
            <Services />
          </section>
        </LazyLoad>
      </Suspense>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ai" element={<Ai />} />
      </Routes>
    </Router>
  );
};

export default App;
