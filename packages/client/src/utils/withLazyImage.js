import React from "react";
import LazyImage from "../components/LazyImage";

const withLazyImage = (WrappedComponent) => {
  return React.memo(function WithLazyImageComponent(props) {
    const enhancedProps = {
      ...props,
      renderImage: ({ src, alt, className }) => (
        <LazyImage src={src} alt={alt} className={className} />
      ),
    };

    return <WrappedComponent {...enhancedProps} />;
  });
};

export default withLazyImage;
