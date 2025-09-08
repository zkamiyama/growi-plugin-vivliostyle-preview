import * as React from "react";
import { Renderer } from "@vivliostyle/react";
import "./styles.css";

export default function App() {
  return (
    <div className="App">
      <Renderer source="https://vivliostyle.github.io/vivliostyle_doc/samples/gon/index.html">
        {({ container }) => container}
      </Renderer>
    </div>
  );
}
