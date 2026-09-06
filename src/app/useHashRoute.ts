import { useEffect, useState } from "react";

export type Route = "visualization" | "docs";

function currentRoute(): Route {
  return window.location.hash === "#/docs" ? "docs" : "visualization";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  return route;
}
