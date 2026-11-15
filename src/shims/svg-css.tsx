/**
 * Stand-in for react-native-svg/css. Only the QR code library imports it (for an SVG logo inside the
 * code, which we don't use), and the real one drags in a ~600 KB CSS parser. SVGs still draw, just
 * without <style> CSS rules. Wired up in metro.config.js.
 */
import React from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { SvgUri, SvgXml, type UriProps, type XmlProps } from 'react-native-svg';

export const SvgCss = (props: XmlProps) => <SvgXml {...props} />;
export const SvgCssUri = (props: UriProps) => <SvgUri {...props} />;
export const SvgWithCss = SvgCss;
export const SvgWithCssUri = SvgCssUri;
export const inlineStyles = undefined;
/** an SVG file bundled with the app */
export const LocalSvg = ({ asset, ...props }: Omit<UriProps, 'uri'> & { asset: ImageSourcePropType }) => (
  <SvgUri uri={Image.resolveAssetSource(asset)?.uri ?? null} {...props} />
);
export const WithLocalSvg = LocalSvg;
