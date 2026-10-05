import{c as f,q as x}from"./index-CbohD5aH.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],O=f("external-link",C),m=e=>typeof e=="boolean"?`${e}`:e===0?"0":e,y=x,_=(e,a)=>n=>{var o;if((a==null?void 0:a.variants)==null)return y(e,n==null?void 0:n.class,n==null?void 0:n.className);const{variants:r,defaultVariants:d}=a,k=Object.keys(r).map(t=>{const l=n==null?void 0:n[t],s=d==null?void 0:d[t];if(l===null)return null;const i=m(l)||m(s);return r[t][i]}),c=n&&Object.entries(n).reduce((t,l)=>{let[s,i]=l;return i===void 0||(t[s]=i),t},{}),V=a==null||(o=a.compoundVariants)===null||o===void 0?void 0:o.reduce((t,l)=>{let{class:s,className:i,...h}=l;return Object.entries(h).every(N=>{let[v,u]=N;return Array.isArray(u)?u.includes({...d,...c}[v]):{...d,...c}[v]===u})?[...t,s,i]:t},[]);return y(e,k,V,n==null?void 0:n.class,n==null?void 0:n.className)};export{O as E,_ as c};
