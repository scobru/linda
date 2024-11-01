function inherits(ctor, superCtor) {
    if (typeof superCtor !== 'function' && superCtor !== null) {
        throw new TypeError('Super expression must either be null or a function');
    }
    if (superCtor) {
        ctor.super_ = superCtor;
        Object.setPrototypeOf 
            ? Object.setPrototypeOf(ctor.prototype, superCtor.prototype)
            : ctor.prototype = Object.create(superCtor.prototype);
        ctor.prototype.constructor = ctor;
    }
}

// Assicuriamoci che sia compatibile sia con ES modules che con CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = inherits;
}
export default inherits;