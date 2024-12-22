import 'gun/sea.js';
import { ethers } from 'ethers';

var commonjsGlobal =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : typeof self !== 'undefined'
    ? self
    : {};

function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default')
    ? x['default']
    : x;
}

var gun$1 = { exports: {} };

gun$1.exports;

var hasRequiredGun;

function requireGun() {
  if (hasRequiredGun) return gun$1.exports;
  hasRequiredGun = 1;
  (function (module) {
    (function () {
      /* UNBUILD */
      function USE(arg, req) {
        return req
          ? require(arg)
          : arg.slice
          ? USE[R(arg)]
          : function (mod, path) {
              arg((mod = { exports: {} }));
              USE[R(path)] = mod.exports;
            };
        function R(p) {
          return p.split('/').slice(-1).toString().replace('.js', '');
        }
      }
      {
        var MODULE = module;
      }
      USE(function (module) {
        // Shim for generic javascript utilities.
        String.random = function (l, c) {
          var s = '';
          l = l || 24; // you are not going to make a 0 length random number, so no need to check type
          c =
            c ||
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
          while (l-- > 0) {
            s += c.charAt(Math.floor(Math.random() * c.length));
          }
          return s;
        };
        String.match = function (t, o) {
          var tmp, u;
          if ('string' !== typeof t) {
            return false;
          }
          if ('string' == typeof o) {
            o = { '=': o };
          }
          o = o || {};
          tmp = o['='] || o['*'] || o['>'] || o['<'];
          if (t === tmp) {
            return true;
          }
          if (u !== o['=']) {
            return false;
          }
          tmp = o['*'] || o['>'];
          if (t.slice(0, (tmp || '').length) === tmp) {
            return true;
          }
          if (u !== o['*']) {
            return false;
          }
          if (u !== o['>'] && u !== o['<']) {
            return t >= o['>'] && t <= o['<'] ? true : false;
          }
          if (u !== o['>'] && t >= o['>']) {
            return true;
          }
          if (u !== o['<'] && t <= o['<']) {
            return true;
          }
          return false;
        };
        String.hash = function (s, c) {
          // via SO
          if (typeof s !== 'string') {
            return;
          }
          c = c || 0; // CPU schedule hashing by
          if (!s.length) {
            return c;
          }
          for (var i = 0, l = s.length, n; i < l; ++i) {
            n = s.charCodeAt(i);
            c = (c << 5) - c + n;
            c |= 0;
          }
          return c;
        };
        var has = Object.prototype.hasOwnProperty;
        Object.plain = function (o) {
          return o
            ? (o instanceof Object && o.constructor === Object) ||
                Object.prototype.toString
                  .call(o)
                  .match(/^\[object (\w+)\]$/)[1] === 'Object'
            : false;
        };
        Object.empty = function (o, n) {
          for (var k in o) {
            if (has.call(o, k) && (!n || -1 == n.indexOf(k))) {
              return false;
            }
          }
          return true;
        };
        Object.keys =
          Object.keys ||
          function (o) {
            var l = [];
            for (var k in o) {
              if (has.call(o, k)) {
                l.push(k);
              }
            }
            return l;
          };
        (function () {
          var u,
            sT = setTimeout,
            l = 0,
            c = 0,
            sI =
              (typeof setTimeout !== '' + u && setTimeout) ||
              (function (c, f) {
                if (typeof MessageChannel == '' + u) {
                  return sT;
                }
                (c = new MessageChannel()).port1.onmessage = function (e) {
                  '' == e.data && f();
                };
                return function (q) {
                  f = q;
                  c.port2.postMessage('');
                };
              })(),
            check = (sT.check = sT.check ||
              (typeof performance !== '' + u && performance) || {
                now: function () {
                  return +new Date();
                },
              });
          sT.hold = sT.hold || 9; // half a frame benchmarks faster than < 1ms?
          sT.poll =
            sT.poll ||
            function (f) {
              if (sT.hold >= check.now() - l && c++ < 3333) {
                f();
                return;
              }
              sI(function () {
                l = check.now();
                f();
              }, (c = 0));
            };
        })();
        (function () {
          // Too many polls block, this "threads" them in turns over a single thread in time.
          var sT = setTimeout,
            t = (sT.turn =
              sT.turn ||
              function (f) {
                1 == s.push(f) && p(T);
              }),
            s = (t.s = []),
            p = sT.poll,
            i = 0,
            f,
            T = function () {
              if ((f = s[i++])) {
                f();
              }
              if (i == s.length || 99 == i) {
                s = t.s = s.slice(i);
                i = 0;
              }
              if (s.length) {
                p(T);
              }
            };
        })();
        (function () {
          var u,
            sT = setTimeout,
            T = sT.turn;
          (sT.each =
            sT.each ||
            function (l, f, e, S) {
              S = S || 9;
              (function t(s, L, r) {
                if ((L = (s = (l || []).splice(0, S)).length)) {
                  for (var i = 0; i < L; i++) {
                    if (u !== (r = f(s[i]))) {
                      break;
                    }
                  }
                  if (u === r) {
                    T(t);
                    return;
                  }
                }
                e && e(r);
              })();
            })();
        })();
      })(USE, './shim');
      USE(function (module) {
        // On event emitter generic javascript utility.
        module.exports = function onto(tag, arg, as) {
          if (!tag) {
            return { to: onto };
          }
          var u,
            f = 'function' == typeof arg,
            tag =
              (this.tag || (this.tag = {}))[tag] ||
              (f &&
                (this.tag[tag] = {
                  tag: tag,
                  to: (onto._ = {
                    next: function (arg) {
                      var tmp;
                      if ((tmp = this.to)) {
                        tmp.next(arg);
                      }
                    },
                  }),
                }));
          if (f) {
            var be = {
              off:
                onto.off ||
                (onto.off = function () {
                  if (this.next === onto._.next) {
                    return !0;
                  }
                  if (this === this.the.last) {
                    this.the.last = this.back;
                  }
                  this.to.back = this.back;
                  this.next = onto._.next;
                  this.back.to = this.to;
                  if (this.the.last === this.the) {
                    delete this.on.tag[this.the.tag];
                  }
                }),
              to: onto._,
              next: arg,
              the: tag,
              on: this,
              as: as,
            };
            (be.back = tag.last || tag).to = be;
            return (tag.last = be);
          }
          if ((tag = tag.to) && u !== arg) {
            tag.next(arg);
          }
          return tag;
        };
      })(USE, './onto');
      USE(function (module) {
        // Valid values are a subset of JSON: null, binary, number (!Infinity), text,
        // or a soul relation. Arrays need special algorithms to handle concurrency,
        // so they are not supported directly. Use an extension that supports them if
        // needed but research their problems first.
        module.exports = function (v) {
          // "deletes", nulling out keys.
          return (
            v === null ||
            'string' === typeof v ||
            'boolean' === typeof v ||
            // we want +/- Infinity to be, but JSON does not support it, sad face.
            // can you guess what v === v checks for? ;)
            ('number' === typeof v &&
              v != Infinity &&
              v != -Infinity &&
              v === v) ||
            (!!v &&
              'string' == typeof v['#'] &&
              Object.keys(v).length === 1 &&
              v['#'])
          );
        };
      })(USE, './valid');
      USE(function (module) {
        USE('./shim');
        function State() {
          var t = +new Date();
          if (last < t) {
            return (N = 0), (last = t + State.drift);
          }
          return (last = t + (N += 1) / D + State.drift);
        }
        State.drift = 0;
        var NI = -Infinity,
          N = 0,
          D = 999,
          last = NI,
          u; // WARNING! In the future, on machines that are D times faster than 2016AD machines, you will want to increase D by another several orders of magnitude so the processing speed never out paces the decimal resolution (increasing an integer effects the state accuracy).
        State.is = function (n, k, o) {
          // convenience function to get the state on a key on a node and return it.
          var tmp = (k && n && n._ && n._['>']) || o;
          if (!tmp) {
            return;
          }
          return 'number' == typeof (tmp = tmp[k]) ? tmp : NI;
        };
        State.ify = function (n, k, s, v, soul) {
          // put a key's state on a node.
          (n = n || {})._ = n._ || {}; // safety check or init.
          if (soul) {
            n._['#'] = soul;
          } // set a soul if specified.
          var tmp = n._['>'] || (n._['>'] = {}); // grab the states data.
          if (u !== k && k !== '_') {
            if ('number' == typeof s) {
              tmp[k] = s;
            } // add the valid state.
            if (u !== v) {
              n[k] = v;
            } // Note: Not its job to check for valid values!
          }
          return n;
        };
        module.exports = State;
      })(USE, './state');
      USE(function (module) {
        USE('./shim');
        function Dup(opt) {
          var dup = { s: {} },
            s = dup.s;
          opt = opt || { max: 999, age: 1000 * 9 }; //*/ 1000 * 9 * 3};
          dup.check = function (id) {
            if (!s[id]) {
              return false;
            }
            return dt(id);
          };
          var dt = (dup.track = function (id) {
            var it = s[id] || (s[id] = {});
            it.was = dup.now = +new Date();
            if (!dup.to) {
              dup.to = setTimeout(dup.drop, opt.age + 9);
            }
            if (dt.ed) {
              dt.ed(id);
            }
            return it;
          });
          dup.drop = function (age) {
            dup.to = null;
            dup.now = +new Date();
            var l = Object.keys(s);
            console.STAT &&
              console.STAT(dup.now, +new Date() - dup.now, 'dup drop keys'); // prev ~20% CPU 7% RAM 300MB // now ~25% CPU 7% RAM 500MB
            setTimeout.each(
              l,
              function (id) {
                var it = s[id]; // TODO: .keys( is slow?
                if (it && (age || opt.age) > dup.now - it.was) {
                  return;
                }
                delete s[id];
              },
              0,
              99
            );
          };
          return dup;
        }
        module.exports = Dup;
      })(USE, './dup');
      USE(function (module) {
        // request / response module, for asking and acking messages.
        USE('./onto'); // depends upon onto!
        module.exports = function ask(cb, as) {
          if (!this.on) {
            return;
          }
          var lack = (this.opt || {}).lack || 9000;
          if (!('function' == typeof cb)) {
            if (!cb) {
              return;
            }
            var id = cb['#'] || cb,
              tmp = (this.tag || '')[id];
            if (!tmp) {
              return;
            }
            if (as) {
              tmp = this.on(id, as);
              clearTimeout(tmp.err);
              tmp.err = setTimeout(function () {
                tmp.off();
              }, lack);
            }
            return true;
          }
          var id = (as && as['#']) || random(9);
          if (!cb) {
            return id;
          }
          var to = this.on(id, cb, as);
          to.err =
            to.err ||
            setTimeout(function () {
              to.off();
              to.next({ err: 'Error: No ACK yet.', lack: true });
            }, lack);
          return id;
        };
        var random =
          String.random ||
          function () {
            return Math.random().toString(36).slice(2);
          };
      })(USE, './ask');
      USE(function (module) {
        function Gun(o) {
          if (o instanceof Gun) {
            return (this._ = { $: this }).$;
          }
          if (!(this instanceof Gun)) {
            return new Gun(o);
          }
          return Gun.create((this._ = { $: this, opt: o }));
        }

        Gun.is = function ($) {
          return $ instanceof Gun || ($ && $._ && $ === $._.$) || false;
        };

        Gun.version = 0.202;

        Gun.chain = Gun.prototype;
        Gun.chain.toJSON = function () {};

        USE('./shim');
        Gun.valid = USE('./valid');
        Gun.state = USE('./state');
        Gun.on = USE('./onto');
        Gun.dup = USE('./dup');
        Gun.ask = USE('./ask');
        (function () {
          Gun.create = function (at) {
            at.root = at.root || at;
            at.graph = at.graph || {};
            at.on = at.on || Gun.on;
            at.ask = at.ask || Gun.ask;
            at.dup = at.dup || Gun.dup();
            var gun = at.$.opt(at.opt);
            if (!at.once) {
              at.on('in', universe, at);
              at.on('out', universe, at);
              at.on('put', map, at);
              Gun.on('create', at);
              at.on('create', at);
            }
            at.once = 1;
            return gun;
          };
          function universe(msg) {
            // TODO: BUG! msg.out = null being set!
            //if(!F){ var eve = this; setTimeout(function(){ universe.call(eve, msg,1) },Math.random() * 100);return; } // ADD F TO PARAMS!
            if (!msg) {
              return;
            }
            if (msg.out === universe) {
              this.to.next(msg);
              return;
            }
            var eve = this,
              as = eve.as,
              at = as.at || as,
              gun = at.$,
              dup = at.dup,
              tmp,
              DBG = msg.DBG;
            (tmp = msg['#']) || (tmp = msg['#'] = text_rand(9));
            if (dup.check(tmp)) {
              return;
            }
            dup.track(tmp);
            tmp = msg._;
            msg._ = 'function' == typeof tmp ? tmp : function () {};
            (msg.$ && msg.$ === (msg.$._ || '').$) || (msg.$ = gun);
            if (msg['@'] && !msg.put) {
              ack(msg);
            }
            if (!at.ask(msg['@'], msg)) {
              // is this machine listening for an ack?
              DBG && (DBG.u = +new Date());
              if (msg.put) {
                put(msg);
                return;
              } else if (msg.get) {
                Gun.on.get(msg, gun);
              }
            }
            DBG && (DBG.uc = +new Date());
            eve.to.next(msg);
            DBG && (DBG.ua = +new Date());
            if (msg.nts || msg.NTS) {
              return;
            } // TODO: This shouldn't be in core, but fast way to prevent NTS spread. Delete this line after all peers have upgraded to newer versions.
            msg.out = universe;
            at.on('out', msg);
            DBG && (DBG.ue = +new Date());
          }
          function put(msg) {
            if (!msg) {
              return;
            }
            var ctx = msg._ || '',
              root = (ctx.root = ((ctx.$ = msg.$ || '')._ || '').root);
            if (msg['@'] && ctx.faith && !ctx.miss) {
              // TODO: AXE may split/route based on 'put' what should we do here? Detect @ in AXE? I think we don't have to worry, as DAM will route it on @.
              msg.out = universe;
              root.on('out', msg);
              return;
            }
            ctx.latch = root.hatch;
            ctx.match = root.hatch = [];
            var put = msg.put;
            var DBG = (ctx.DBG = msg.DBG),
              S = +new Date();
            CT = CT || S;
            if (put['#'] && put['.']) {
              /*root && root.on('put', msg);*/ return;
            } // TODO: BUG! This needs to call HAM instead.
            DBG && (DBG.p = S);
            ctx['#'] = msg['#'];
            ctx.msg = msg;
            ctx.all = 0;
            ctx.stun = 1;
            var nl = Object.keys(put); //.sort(); // TODO: This is unbounded operation, large graphs will be slower. Write our own CPU scheduled sort? Or somehow do it in below? Keys itself is not O(1) either, create ES5 shim over ?weak map? or custom which is constant.
            console.STAT &&
              console.STAT(S, ((DBG || ctx).pk = +new Date()) - S, 'put sort');
            var ni = 0,
              nj,
              kl,
              soul,
              node,
              states,
              err,
              tmp;
            (function pop(o) {
              if (nj != ni) {
                nj = ni;
                if (!(soul = nl[ni])) {
                  console.STAT &&
                    console.STAT(S, ((DBG || ctx).pd = +new Date()) - S, 'put');
                  fire(ctx);
                  return;
                }
                if (!(node = put[soul])) {
                  err = ERR + cut(soul) + 'no node.';
                } else if (!(tmp = node._)) {
                  err = ERR + cut(soul) + 'no meta.';
                } else if (soul !== tmp['#']) {
                  err = ERR + cut(soul) + 'soul not same.';
                } else if (!(states = tmp['>'])) {
                  err = ERR + cut(soul) + 'no state.';
                }
                kl = Object.keys(node || {}); // TODO: .keys( is slow
              }
              if (err) {
                msg.err = ctx.err = err; // invalid data should error and stun the message.
                fire(ctx);
                //console.log("handle error!", err) // handle!
                return;
              }
              var i = 0,
                key;
              o = o || 0;
              while (o++ < 9 && (key = kl[i++])) {
                if ('_' === key) {
                  continue;
                }
                var val = node[key],
                  state = states[key];
                if (u === state) {
                  err = ERR + cut(key) + 'on' + cut(soul) + 'no state.';
                  break;
                }
                if (!valid(val)) {
                  err =
                    ERR +
                    cut(key) +
                    'on' +
                    cut(soul) +
                    'bad ' +
                    typeof val +
                    cut(val);
                  break;
                }
                //ctx.all++; //ctx.ack[soul+key] = '';
                ham(val, key, soul, state, msg);
                ++C; // courtesy count;
              }
              if ((kl = kl.slice(i)).length) {
                turn(pop);
                return;
              }
              ++ni;
              kl = null;
              pop(o);
            })();
          }
          Gun.on.put = put;
          // TODO: MARK!!! clock below, reconnect sync, SEA certify wire merge, User.auth taking multiple times, // msg put, put, say ack, hear loop...
          // WASIS BUG! local peer not ack. .off other people: .open
          function ham(val, key, soul, state, msg) {
            var ctx = msg._ || '',
              root = ctx.root,
              graph = root.graph,
              tmp;
            var vertex = graph[soul] || empty,
              was = state_is(vertex, key, 1),
              known = vertex[key];

            var DBG = ctx.DBG;
            if ((tmp = console.STAT)) {
              if (!graph[soul] || !known) {
                tmp.has = (tmp.has || 0) + 1;
              }
            }

            var now = State();
            if (state > now) {
              setTimeout(
                function () {
                  ham(val, key, soul, state, msg);
                },
                (tmp = state - now) > MD ? MD : tmp
              ); // Max Defer 32bit. :(
              console.STAT &&
                console.STAT(((DBG || ctx).Hf = +new Date()), tmp, 'future');
              return;
            }
            if (state < was) {
              /*old;*/ {
                return;
              }
            } // but some chains have a cache miss that need to re-fire. // TODO: Improve in future. // for AXE this would reduce rebroadcast, but GUN does it on message forwarding. // TURNS OUT CACHE MISS WAS NOT NEEDED FOR NEW CHAINS ANYMORE!!! DANGER DANGER DANGER, ALWAYS RETURN! (or am I missing something?)
            if (!ctx.faith) {
              // TODO: BUG? Can this be used for cache miss as well? // Yes this was a bug, need to check cache miss for RAD tests, but should we care about the faith check now? Probably not.
              if (state === was && (val === known || L(val) <= L(known))) {
                /*console.log("same");*/ /*same;*/ if (!ctx.miss) {
                  return;
                }
              } // same
            }
            ctx.stun++; // TODO: 'forget' feature in SEA tied to this, bad approach, but hacked in for now. Any changes here must update there.
            var aid = msg['#'] + ctx.all++,
              id = {
                toString: function () {
                  return aid;
                },
                _: ctx,
              };
            id.toJSON = id.toString; // this *trick* makes it compatible between old & new versions.
            root.dup.track(id)['#'] = msg['#']; // fixes new OK acks for RPC like RTC.
            DBG && (DBG.ph = DBG.ph || +new Date());
            root.on('put', {
              '#': id,
              '@': msg['@'],
              put: { '#': soul, '.': key, ':': val, '>': state },
              ok: msg.ok,
              _: ctx,
            });
          }
          function map(msg) {
            var DBG;
            if ((DBG = (msg._ || '').DBG)) {
              DBG.pa = +new Date();
              DBG.pm = DBG.pm || +new Date();
            }
            var eve = this,
              root = eve.as,
              graph = root.graph,
              ctx = msg._,
              put = msg.put,
              soul = put['#'],
              key = put['.'],
              val = put[':'],
              state = put['>'];
            msg['#'];
            var tmp;
            if ((tmp = ctx.msg) && (tmp = tmp.put) && (tmp = tmp[soul])) {
              state_ify(tmp, key, state, val, soul);
            } // necessary! or else out messages do not get SEA transforms.
            //var bytes = ((graph[soul]||'')[key]||'').length||1;
            graph[soul] = state_ify(graph[soul], key, state, val, soul);
            if ((tmp = (root.next || '')[soul])) {
              //tmp.bytes = (tmp.bytes||0) + ((val||'').length||1) - bytes;
              //if(tmp.bytes > 2**13){ Gun.log.once('byte-limit', "Note: In the future, GUN peers will enforce a ~4KB query limit. Please see https://gun.eco/docs/Page") }
              tmp.on('in', msg);
            }
            fire(ctx);
            eve.to.next(msg);
          }
          function fire(ctx, msg) {
            var root;
            if (ctx.stop) {
              return;
            }
            if (!ctx.err && 0 < --ctx.stun) {
              return;
            } // TODO: 'forget' feature in SEA tied to this, bad approach, but hacked in for now. Any changes here must update there.
            ctx.stop = 1;
            if (!(root = ctx.root)) {
              return;
            }
            var tmp = ctx.match;
            tmp.end = 1;
            if (tmp === root.hatch) {
              if (!(tmp = ctx.latch) || tmp.end) {
                delete root.hatch;
              } else {
                root.hatch = tmp;
              }
            }
            ctx.hatch && ctx.hatch(); // TODO: rename/rework how put & this interact.
            setTimeout.each(ctx.match, function (cb) {
              cb && cb();
            });
            if (!(msg = ctx.msg) || ctx.err || msg.err) {
              return;
            }
            msg.out = universe;
            ctx.root.on('out', msg);

            CF(); // courtesy check;
          }
          function ack(msg) {
            // aggregate ACKs.
            var id = msg['@'] || '',
              ctx;
            if (!(ctx = id._)) {
              var dup =
                (dup = msg.$) &&
                (dup = dup._) &&
                (dup = dup.root) &&
                (dup = dup.dup);
              if (!(dup = dup.check(id))) {
                return;
              }
              msg['@'] = dup['#'] || msg['@']; // This doesn't do anything anymore, backtrack it to something else?
              return;
            }
            ctx.acks = (ctx.acks || 0) + 1;
            if ((ctx.err = msg.err)) {
              msg['@'] = ctx['#'];
              fire(ctx); // TODO: BUG? How it skips/stops propagation of msg if any 1 item is error, this would assume a whole batch/resync has same malicious intent.
            }
            ctx.ok = msg.ok || ctx.ok;
            if (!ctx.stop && !ctx.crack) {
              ctx.crack =
                ctx.match &&
                ctx.match.push(function () {
                  back(ctx);
                });
            } // handle synchronous acks. NOTE: If a storage peer ACKs synchronously then the PUT loop has not even counted up how many items need to be processed, so ctx.STOP flags this and adds only 1 callback to the end of the PUT loop.
            back(ctx);
          }
          function back(ctx) {
            if (!ctx || !ctx.root) {
              return;
            }
            if (ctx.stun || ctx.acks !== ctx.all) {
              return;
            }
            ctx.root.on('in', {
              '@': ctx['#'],
              err: ctx.err,
              ok: ctx.err ? u : ctx.ok || { '': 1 },
            });
          }

          var ERR = 'Error: Invalid graph!';
          var cut = function (s) {
            return " '" + ('' + s).slice(0, 9) + "...' ";
          };
          var L = JSON.stringify,
            MD = 2147483647,
            State = Gun.state;
          var C = 0,
            CT,
            CF = function () {
              if (C > 999 && C / -(CT - (CT = +new Date())) > 1) {
                Gun.window &&
                  console.log(
                    "Warning: You're syncing 1K+ records a second, faster than DOM can update - consider limiting query."
                  );
                CF = function () {
                  C = 0;
                };
              }
            };
        })();
        (function () {
          Gun.on.get = function (msg, gun) {
            var root = gun._,
              get = msg.get,
              soul = get['#'],
              node = root.graph[soul],
              has = get['.'];
            var next = root.next || (root.next = {}),
              at = next[soul];

            // TODO: Azarattum bug, what is in graph is not same as what is in next. Fix!

            // queue concurrent GETs?
            // TODO: consider tagging original message into dup for DAM.
            // TODO: ^ above? In chat app, 12 messages resulted in same peer asking for `#user.pub` 12 times. (same with #user GET too, yipes!) // DAM note: This also resulted in 12 replies from 1 peer which all had same ##hash but none of them deduped because each get was different.
            // TODO: Moving quick hacks fixing these things to axe for now.
            // TODO: a lot of GET #foo then GET #foo."" happening, why?
            // TODO: DAM's ## hash check, on same get ACK, producing multiple replies still, maybe JSON vs YSON?
            // TMP note for now: viMZq1slG was chat LEX query #.
            /*if(gun !== (tmp = msg.$) && (tmp = (tmp||'')._)){
							if(tmp.Q){ tmp.Q[msg['#']] = ''; return } // chain does not need to ask for it again.
							tmp.Q = {};
						}*/
            /*if(u === has){
							if(at.Q){
								//at.Q[msg['#']] = '';
								//return;
							}
							at.Q = {};
						}*/
            var ctx = msg._ || {},
              DBG = (ctx.DBG = msg.DBG);
            DBG && (DBG.g = +new Date());
            //console.log("GET:", get, node, has, at);
            //if(!node && !at){ return root.on('get', msg) }
            //if(has && node){ // replace 2 below lines to continue dev?
            if (!node) {
              return root.on('get', msg);
            }
            if (has) {
              if ('string' != typeof has || u === node[has]) {
                if (!((at || '').next || '')[has]) {
                  root.on('get', msg);
                  return;
                }
              }
              node = state_ify({}, has, state_is(node, has), node[has], soul);
              // If we have a key in-memory, do we really need to fetch?
              // Maybe... in case the in-memory key we have is a local write
              // we still need to trigger a pull/merge from peers.
            }
            //Gun.window? Gun.obj.copy(node) : node; // HNPERF: If !browser bump Performance? Is this too dangerous to reference root graph? Copy / shallow copy too expensive for big nodes. Gun.obj.to(node); // 1 layer deep copy // Gun.obj.copy(node); // too slow on big nodes
            node && ack(msg, node);
            root.on('get', msg); // send GET to storage adapters.
          };
          function ack(msg, node) {
            var S = +new Date(),
              ctx = msg._ || {},
              DBG = (ctx.DBG = msg.DBG);
            var to = msg['#'],
              id = text_rand(9),
              keys = Object.keys(node || '').sort(),
              soul = ((node || '')._ || '')['#'];
            keys.length;
            var root = msg.$._.root,
              F = node === root.graph[soul];
            console.STAT &&
              console.STAT(S, ((DBG || ctx).gk = +new Date()) - S, 'got keys');
            // PERF: Consider commenting this out to force disk-only reads for perf testing? // TODO: .keys( is slow
            node &&
              (function go() {
                S = +new Date();
                var i = 0,
                  k,
                  put = {},
                  tmp;
                while (i < 9 && (k = keys[i++])) {
                  state_ify(put, k, state_is(node, k), node[k], soul);
                }
                keys = keys.slice(i);
                (tmp = {})[soul] = put;
                put = tmp;
                var faith;
                if (F) {
                  faith = function () {};
                  faith.ram = faith.faith = true;
                } // HNPERF: We're testing performance improvement by skipping going through security again, but this should be audited.
                tmp = keys.length;
                console.STAT &&
                  console.STAT(S, -(S - (S = +new Date())), 'got copied some');
                DBG && (DBG.ga = +new Date());
                root.on('in', {
                  '@': to,
                  '#': id,
                  put: put,
                  '%': tmp ? (id = text_rand(9)) : u,
                  $: root.$,
                  _: faith,
                  DBG: DBG,
                  FOO: 1,
                });
                console.STAT && console.STAT(S, +new Date() - S, 'got in');
                if (!tmp) {
                  return;
                }
                setTimeout.turn(go);
              })();
            if (!node) {
              root.on('in', { '@': msg['#'] });
            } // TODO: I don't think I like this, the default lS adapter uses this but "not found" is a sensitive issue, so should probably be handled more carefully/individually.
          }
          Gun.on.get.ack = ack;
        })();
        (function () {
          Gun.chain.opt = function (opt) {
            opt = opt || {};
            var gun = this,
              at = gun._,
              tmp = opt.peers || opt;
            if (!Object.plain(opt)) {
              opt = {};
            }
            if (!Object.plain(at.opt)) {
              at.opt = opt;
            }
            if ('string' == typeof tmp) {
              tmp = [tmp];
            }
            if (!Object.plain(at.opt.peers)) {
              at.opt.peers = {};
            }
            if (tmp instanceof Array) {
              opt.peers = {};
              tmp.forEach(function (url) {
                var p = {};
                p.id = p.url = url;
                opt.peers[url] = at.opt.peers[url] = at.opt.peers[url] || p;
              });
            }
            obj_each(opt, function each(k) {
              var v = this[k];
              if (
                (this && this.hasOwnProperty(k)) ||
                'string' == typeof v ||
                Object.empty(v)
              ) {
                this[k] = v;
                return;
              }
              if (v && v.constructor !== Object && !(v instanceof Array)) {
                return;
              }
              obj_each(v, each);
            });
            at.opt.from = opt;
            Gun.on('opt', at);
            at.opt.uuid =
              at.opt.uuid ||
              function uuid(l) {
                return (
                  Gun.state().toString(36).replace('.', '') +
                  String.random(l || 12)
                );
              };
            return gun;
          };
        })();

        var obj_each = function (o, f) {
            Object.keys(o).forEach(f, o);
          },
          text_rand = String.random,
          turn = setTimeout.turn,
          valid = Gun.valid,
          state_is = Gun.state.is,
          state_ify = Gun.state.ify,
          u,
          empty = {},
          C;

        Gun.log = function () {
          return (
            !Gun.log.off && C.log.apply(C, arguments),
            [].slice.call(arguments).join(' ')
          );
        };
        Gun.log.once = function (w, s, o) {
          return ((o = Gun.log.once)[w] = o[w] || 0), o[w]++ || Gun.log(s);
        };

        if (typeof window !== 'undefined') {
          (window.GUN = window.Gun = Gun).window = window;
        }
        try {
          if (typeof MODULE !== 'undefined') {
            MODULE.exports = Gun;
          }
        } catch (e) {}
        module.exports = Gun;

        (Gun.window || {}).console = (Gun.window || {}).console || {
          log: function () {},
        };
        (C = console).only = function (i, s) {
          return (
            C.only.i &&
            i === C.only.i &&
            C.only.i++ &&
            (C.log.apply(C, arguments) || s)
          );
        };
        Gun.log.once(
          'welcome',
          'Hello wonderful person! :) Thanks for using GUN, please ask for help on http://chat.gun.eco if anything takes you longer than 5min to figure out!'
        );
      })(USE, './root');
      USE(function (module) {
        var Gun = USE('./root');
        Gun.chain.back = function (n, opt) {
          var tmp;
          n = n || 1;
          if (-1 === n || Infinity === n) {
            return this._.root.$;
          } else if (1 === n) {
            return (this._.back || this._).$;
          }
          var gun = this,
            at = gun._;
          if (typeof n === 'string') {
            n = n.split('.');
          }
          if (n instanceof Array) {
            var i = 0,
              l = n.length,
              tmp = at;
            for (i; i < l; i++) {
              tmp = (tmp || empty)[n[i]];
            }
            if (u !== tmp) {
              return opt ? gun : tmp;
            } else if ((tmp = at.back)) {
              return tmp.$.back(n, opt);
            }
            return;
          }
          if ('function' == typeof n) {
            var yes,
              tmp = { back: at };
            while ((tmp = tmp.back) && u === (yes = n(tmp, opt))) {}
            return yes;
          }
          if ('number' == typeof n) {
            return (at.back || at).$.back(n - 1);
          }
          return this;
        };
        var empty = {},
          u;
      })(USE, './back');
      USE(function (module) {
        // WARNING: GUN is very simple, but the JavaScript chaining API around GUN
        // is complicated and was extremely hard to build. If you port GUN to another
        // language, consider implementing an easier API to build.
        var Gun = USE('./root');
        Gun.chain.chain = function (sub) {
          var gun = this,
            at = gun._,
            chain = new (sub || gun).constructor(gun),
            cat = chain._,
            root;
          cat.root = root = at.root;
          cat.id = ++root.once;
          cat.back = gun._;
          cat.on = Gun.on;
          cat.on('in', Gun.on.in, cat); // For 'in' if I add my own listeners to each then I MUST do it before in gets called. If I listen globally for all incoming data instead though, regardless of individual listeners, I can transform the data there and then as well.
          cat.on('out', Gun.on.out, cat); // However for output, there isn't really the global option. I must listen by adding my own listener individually BEFORE this one is ever called.
          return chain;
        };

        function output(msg) {
          var get,
            at = this.as,
            back = at.back,
            root = at.root,
            tmp;
          if (!msg.$) {
            msg.$ = at.$;
          }
          this.to.next(msg);
          if (at.err) {
            at.on('in', { put: (at.put = u), $: at.$ });
            return;
          }
          if ((get = msg.get)) {
            /*if(u !== at.put){
							at.on('in', at);
							return;
						}*/
            if (root.pass) {
              root.pass[at.id] = at;
            } // will this make for buggy behavior elsewhere?
            if (at.lex) {
              Object.keys(at.lex).forEach(function (k) {
                tmp[k] = at.lex[k];
              }, (tmp = msg.get = msg.get || {}));
            }
            if (get['#'] || at.soul) {
              get['#'] = get['#'] || at.soul;
              //root.graph[get['#']] = root.graph[get['#']] || {_:{'#':get['#'],'>':{}}};
              msg['#'] || (msg['#'] = text_rand(9)); // A3120 ?
              back = root.$.get(get['#'])._;
              if (!(get = get['.'])) {
                // soul
                tmp = back.ask && back.ask['']; // check if we have already asked for the full node
                (back.ask || (back.ask = {}))[''] = back; // add a flag that we are now.
                if (u !== back.put) {
                  // if we already have data,
                  back.on('in', back); // send what is cached down the chain
                  if (tmp) {
                    return;
                  } // and don't ask for it again.
                }
                msg.$ = back.$;
              } else if (obj_has(back.put, get)) {
                // TODO: support #LEX !
                tmp = back.ask && back.ask[get];
                (back.ask || (back.ask = {}))[get] = back.$.get(get)._;
                back.on('in', {
                  get: get,
                  put: {
                    '#': back.soul,
                    '.': get,
                    ':': back.put[get],
                    '>': state_is(root.graph[back.soul], get),
                  },
                });
                if (tmp) {
                  return;
                }
              }
              /*put = (back.$.get(get)._);
								if(!(tmp = put.ack)){ put.ack = -1 }
								back.on('in', {
									$: back.$,
									put: Gun.state.ify({}, get, Gun.state(back.put, get), back.put[get]),
									get: back.get
								});
								if(tmp){ return }
							} else
							if('string' != typeof get){
								var put = {}, meta = (back.put||{})._;
								Gun.obj.map(back.put, function(v,k){
									if(!Gun.text.match(k, get)){ return }
									put[k] = v;
								})
								if(!Gun.obj.empty(put)){
									put._ = meta;
									back.on('in', {$: back.$, put: put, get: back.get})
								}
								if(tmp = at.lex){
									tmp = (tmp._) || (tmp._ = function(){});
									if(back.ack < tmp.ask){ tmp.ask = back.ack }
									if(tmp.ask){ return }
									tmp.ask = 1;
								}
							}
							*/
              root.ask(ack, msg); // A3120 ?
              return root.on('in', msg);
            }
            //if(root.now){ root.now[at.id] = root.now[at.id] || true; at.pass = {} }
            if (get['.']) {
              if (at.get) {
                msg = { get: { '.': at.get }, $: at.$ };
                (back.ask || (back.ask = {}))[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
                return back.on('out', msg);
              }
              msg = { get: at.lex ? msg.get : {}, $: at.$ };
              return back.on('out', msg);
            }
            (at.ask || (at.ask = {}))[''] = at; //at.ack = at.ack || -1;
            if (at.get) {
              get['.'] = at.get;
              (back.ask || (back.ask = {}))[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
              return back.on('out', msg);
            }
          }
          return back.on('out', msg);
        }
        Gun.on.out = output;

        function input(msg, cat) {
          cat = cat || this.as; // TODO: V8 may not be able to optimize functions with different parameter calls, so try to do benchmark to see if there is any actual difference.
          var root = cat.root,
            gun = msg.$ || (msg.$ = cat.$),
            at = (gun || '')._ || empty,
            tmp = msg.put || '',
            soul = tmp['#'],
            key = tmp['.'],
            change = u !== tmp['='] ? tmp['='] : tmp[':'],
            state = tmp['>'] || -Infinity,
            sat; // eve = event, at = data at, cat = chain at, sat = sub at (children chains).
          if (
            u !== msg.put &&
            (u === tmp['#'] ||
              u === tmp['.'] ||
              (u === tmp[':'] && u === tmp['=']) ||
              u === tmp['>'])
          ) {
            // convert from old format
            if (!valid(tmp)) {
              if (!(soul = ((tmp || '')._ || '')['#'])) {
                console.log(
                  'chain not yet supported for',
                  tmp,
                  '...',
                  msg,
                  cat
                );
                return;
              }
              gun = cat.root.$.get(soul);
              return setTimeout.each(Object.keys(tmp).sort(), function (k) {
                // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync?
                if ('_' == k || u === (state = state_is(tmp, k))) {
                  return;
                }
                cat.on('in', {
                  $: gun,
                  put: { '#': soul, '.': k, '=': tmp[k], '>': state },
                  VIA: msg,
                });
              });
            }
            cat.on('in', {
              $: at.back.$,
              put: {
                '#': (soul = at.back.soul),
                '.': (key = at.has || at.get),
                '=': tmp,
                '>': state_is(at.back.put, key),
              },
              via: msg,
            }); // TODO: This could be buggy! It assumes/approxes data, other stuff could have corrupted it.
            return;
          }
          if ((msg.seen || '')[cat.id]) {
            return;
          }
          (msg.seen || (msg.seen = function () {}))[cat.id] = cat; // help stop some infinite loops

          if (cat !== at) {
            // don't worry about this when first understanding the code, it handles changing contexts on a message. A soul chain will never have a different context.
            Object.keys(msg).forEach(function (k) {
              tmp[k] = msg[k];
            }, (tmp = {})); // make copy of message
            tmp.get = cat.get || tmp.get;
            if (!cat.soul && !cat.has) {
              // if we do not recognize the chain type
              tmp.$$$ = tmp.$$$ || cat.$; // make a reference to wherever it came from.
            } else if (at.soul) {
              // a has (property) chain will have a different context sometimes if it is linked (to a soul chain). Anything that is not a soul or has chain, will always have different contexts.
              tmp.$ = cat.$;
              tmp.$$ = tmp.$$ || at.$;
            }
            msg = tmp; // use the message with the new context instead;
          }
          unlink(msg, cat);

          if (
            (cat.soul /* && (cat.ask||'')['']*/ || msg.$$) &&
            state >= state_is(root.graph[soul], key)
          ) {
            // The root has an in-memory cache of the graph, but if our peer has asked for the data then we want a per deduplicated chain copy of the data that might have local edits on it.
            (tmp = root.$.get(soul)._).put = state_ify(
              tmp.put,
              key,
              state,
              change,
              soul
            );
          }
          if (
            !at.soul /*&& (at.ask||'')['']*/ &&
            state >= state_is(root.graph[soul], key) &&
            (sat = (root.$.get(soul)._.next || '')[key])
          ) {
            // Same as above here, but for other types of chains. // TODO: Improve perf by preventing echoes recaching.
            sat.put = change; // update cache
            if ('string' == typeof (tmp = valid(change))) {
              sat.put = root.$.get(tmp)._.put || change; // share same cache as what we're linked to.
            }
          }

          this.to && this.to.next(msg); // 1st API job is to call all chain listeners.
          // TODO: Make input more reusable by only doing these (some?) calls if we are a chain we recognize? This means each input listener would be responsible for when listeners need to be called, which makes sense, as they might want to filter.
          cat.any &&
            setTimeout.each(
              Object.keys(cat.any),
              function (any) {
                (any = cat.any[any]) && any(msg);
              },
              0,
              99
            ); // 1st API job is to call all chain listeners. // TODO: .keys( is slow // BUG: Some re-in logic may depend on this being sync.
          cat.echo &&
            setTimeout.each(
              Object.keys(cat.echo),
              function (lat) {
                (lat = cat.echo[lat]) && lat.on('in', msg);
              },
              0,
              99
            ); // & linked at chains // TODO: .keys( is slow // BUG: Some re-in logic may depend on this being sync.

          if (((msg.$$ || '')._ || at).soul) {
            // comments are linear, but this line of code is non-linear, so if I were to comment what it does, you'd have to read 42 other comments first... but you can't read any of those comments until you first read this comment. What!? // shouldn't this match link's check?
            // is there cases where it is a $$ that we do NOT want to do the following?
            if ((sat = cat.next) && (sat = sat[key])) {
              // TODO: possible trick? Maybe have `ionmap` code set a sat? // TODO: Maybe we should do `cat.ask` instead? I guess does not matter.
              tmp = {};
              Object.keys(msg).forEach(function (k) {
                tmp[k] = msg[k];
              });
              tmp.$ = (msg.$$ || msg.$).get((tmp.get = key));
              delete tmp.$$;
              delete tmp.$$$;
              sat.on('in', tmp);
            }
          }

          link(msg, cat);
        }
        Gun.on.in = input;

        function link(msg, cat) {
          cat = cat || this.as || msg.$._;
          if (msg.$$ && this !== Gun.on) {
            return;
          } // $$ means we came from a link, so we are at the wrong level, thus ignore it unless overruled manually by being called directly.
          if (!msg.put || cat.soul) {
            return;
          } // But you cannot overrule being linked to nothing, or trying to link a soul chain - that must never happen.
          var put = msg.put || '',
            link = put['='] || put[':'],
            tmp;
          var root = cat.root,
            tat = root.$.get(put['#']).get(put['.'])._;
          if ('string' != typeof (link = valid(link))) {
            if (this === Gun.on) {
              (tat.echo || (tat.echo = {}))[cat.id] = cat;
            } // allow some chain to explicitly force linking to simple data.
            return; // by default do not link to data that is not a link.
          }
          if (
            (tat.echo || (tat.echo = {}))[cat.id] && // we've already linked ourselves so we do not need to do it again. Except... (annoying implementation details)
            !(root.pass || '')[cat.id]
          ) {
            return;
          } // if a new event listener was added, we need to make a pass through for it. The pass will be on the chain, not always the chain passed down.
          if ((tmp = root.pass)) {
            if (tmp[link + cat.id]) {
              return;
            }
            tmp[link + cat.id] = 1;
          } // But the above edge case may "pass through" on a circular graph causing infinite passes, so we hackily add a temporary check for that.

          (tat.echo || (tat.echo = {}))[cat.id] = cat; // set ourself up for the echo! // TODO: BUG? Echo to self no longer causes problems? Confirm.

          if (cat.has) {
            cat.link = link;
          }
          var sat = root.$.get((tat.link = link))._; // grab what we're linking to.
          (sat.echo || (sat.echo = {}))[tat.id] = tat; // link it.
          var tmp = cat.ask || ''; // ask the chain for what needs to be loaded next!
          if (tmp[''] || cat.lex) {
            // we might need to load the whole thing // TODO: cat.lex probably has edge case bugs to it, need more test coverage.
            sat.on('out', { get: { '#': link } });
          }
          setTimeout.each(
            Object.keys(tmp),
            function (get, sat) {
              // if sub chains are asking for data. // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync?
              if (!get || !(sat = tmp[get])) {
                return;
              }
              sat.on('out', { get: { '#': link, '.': get } }); // go get it.
            },
            0,
            99
          );
        }
        Gun.on.link = link;

        function unlink(msg, cat) {
          // ugh, so much code for seemingly edge case behavior.
          var put = msg.put || '',
            change = u !== put['='] ? put['='] : put[':'],
            root = cat.root,
            link,
            tmp;
          if (u === change) {
            // 1st edge case: If we have a brand new database, no data will be found.
            // TODO: BUG! because emptying cache could be async from below, make sure we are not emptying a newer cache. So maybe pass an Async ID to check against?
            // TODO: BUG! What if this is a map? // Warning! Clearing things out needs to be robust against sync/async ops, or else you'll see `map val get put` test catastrophically fail because map attempts to link when parent graph is streamed before child value gets set. Need to differentiate between lack acks and force clearing.
            if (cat.soul && u !== cat.put) {
              return;
            } // data may not be found on a soul, but if a soul already has data, then nothing can clear the soul as a whole.
            //if(!cat.has){ return }
            tmp = (msg.$$ || msg.$ || '')._ || '';
            if (msg['@'] && (u !== tmp.put || u !== cat.put)) {
              return;
            } // a "not found" from other peers should not clear out data if we have already found it.
            //if(cat.has && u === cat.put && !(root.pass||'')[cat.id]){ return } // if we are already unlinked, do not call again, unless edge case. // TODO: BUG! This line should be deleted for "unlink deeply nested".
            if ((link = cat.link || msg.linked)) {
              delete (root.$.get(link)._.echo || '')[cat.id];
            }
            if (cat.has) {
              // TODO: Empty out links, maps, echos, acks/asks, etc.?
              cat.link = null;
            }
            cat.put = u; // empty out the cache if, for example, alice's car's color no longer exists (relative to alice) if alice no longer has a car.
            // TODO: BUG! For maps, proxy this so the individual sub is triggered, not all subs.
            setTimeout.each(
              Object.keys(cat.next || ''),
              function (get, sat) {
                // empty out all sub chains. // TODO: .keys( is slow // BUG? ?Some re-in logic may depend on this being sync? // TODO: BUG? This will trigger deeper put first, does put logic depend on nested order? // TODO: BUG! For map, this needs to be the isolated child, not all of them.
                if (!(sat = cat.next[get])) {
                  return;
                }
                //if(cat.has && u === sat.put && !(root.pass||'')[sat.id]){ return } // if we are already unlinked, do not call again, unless edge case. // TODO: BUG! This line should be deleted for "unlink deeply nested".
                if (link) {
                  delete (root.$.get(link).get(get)._.echo || '')[sat.id];
                }
                sat.on('in', { get: get, put: u, $: sat.$ }); // TODO: BUG? Add recursive seen check?
              },
              0,
              99
            );
            return;
          }
          if (cat.soul) {
            return;
          } // a soul cannot unlink itself.
          if (msg.$$) {
            return;
          } // a linked chain does not do the unlinking, the sub chain does. // TODO: BUG? Will this cancel maps?
          link = valid(change); // need to unlink anytime we are not the same link, though only do this once per unlink (and not on init).
          tmp = msg.$._ || '';
          if (link === tmp.link || (cat.has && !tmp.link)) {
            if ((root.pass || '')[cat.id] && 'string' !== typeof link);
            else {
              return;
            }
          }
          delete (tmp.echo || '')[cat.id];
          unlink(
            {
              get: cat.get,
              put: u,
              $: msg.$,
              linked: (msg.linked = msg.linked || tmp.link),
            },
            cat
          ); // unlink our sub chains.
        }
        Gun.on.unlink = unlink;

        function ack(msg, ev) {
          //if(!msg['%'] && (this||'').off){ this.off() } // do NOT memory leak, turn off listeners! Now handled by .ask itself
          // manhattan:
          var as = this.as,
            at = as.$._;
          at.root;
          var get = as.get || '',
            tmp = (msg.put || '')[get['#']] || '';
          if (
            !msg.put ||
            ('string' == typeof get['.'] && u === tmp[get['.']])
          ) {
            if (u !== at.put) {
              return;
            }
            if (!at.soul && !at.has) {
              return;
            } // TODO: BUG? For now, only core-chains will handle not-founds, because bugs creep in if non-core chains are used as $ but we can revisit this later for more powerful extensions.
            at.ack = (at.ack || 0) + 1;
            at.on('in', {
              get: at.get,
              put: (at.put = u),
              $: at.$,
              '@': msg['@'],
            });
            /*(tmp = at.Q) && setTimeout.each(Object.keys(tmp), function(id){ // TODO: Temporary testing, not integrated or being used, probably delete.
							Object.keys(msg).forEach(function(k){ tmp[k] = msg[k] }, tmp = {}); tmp['@'] = id; // copy message
							root.on('in', tmp);
						}); delete at.Q;*/
            return;
          }
          (msg._ || {}).miss = 1;
          Gun.on.put(msg);
          return; // eom
        }

        var empty = {},
          u,
          text_rand = String.random,
          valid = Gun.valid,
          obj_has = function (o, k) {
            return o && Object.prototype.hasOwnProperty.call(o, k);
          },
          state = Gun.state,
          state_is = state.is,
          state_ify = state.ify;
      })(USE, './chain');
      USE(function (module) {
        var Gun = USE('./root');
        Gun.chain.get = function (key, cb, as) {
          var gun, tmp;
          if (typeof key === 'string') {
            if (key.length == 0) {
              (gun = this.chain())._.err = {
                err: Gun.log('0 length key!', key),
              };
              if (cb) {
                cb.call(gun, gun._.err);
              }
              return gun;
            }
            var back = this,
              cat = back._;
            var next = cat.next || empty;
            if (!(gun = next[key])) {
              gun = key && cache(key, back);
            }
            gun = gun && gun.$;
          } else if ('function' == typeof key) {
            if (true === cb) {
              return soul(this, key, cb, as), this;
            }
            gun = this;
            var cat = gun._,
              opt = cb || {},
              root = cat.root,
              id;
            opt.at = cat;
            opt.ok = key;
            var wait = {}; // can we assign this to the at instead, like in once?
            //var path = []; cat.$.back(at => { at.get && path.push(at.get.slice(0,9))}); path = path.reverse().join('.');
            function any(msg, eve, f) {
              if (any.stun) {
                return;
              }
              if ((tmp = root.pass) && !tmp[id]) {
                return;
              }
              var at = msg.$._,
                sat = (msg.$$ || '')._,
                data = (sat || at).put,
                odd = !at.has && !at.soul,
                test = {},
                tmp;
              if (odd || u === data) {
                // handles non-core
                data =
                  u === ((tmp = msg.put) || '')['=']
                    ? u === (tmp || '')[':']
                      ? tmp
                      : tmp[':']
                    : tmp['='];
              }
              if ('string' == typeof (tmp = Gun.valid(data))) {
                data =
                  u === (tmp = root.$.get(tmp)._.put)
                    ? opt.not
                      ? u
                      : data
                    : tmp;
              }
              if (opt.not && u === data) {
                return;
              }
              if (u === opt.stun) {
                if ((tmp = root.stun) && tmp.on) {
                  cat.$.back(function (a) {
                    // our chain stunned?
                    tmp.on('' + a.id, (test = {}));
                    if ((test.run || 0) < any.id) {
                      return test;
                    } // if there is an earlier stun on gapless parents/self.
                  });
                  !test.run && tmp.on('' + at.id, (test = {})); // this node stunned?
                  !test.run && sat && tmp.on('' + sat.id, (test = {})); // linked node stunned?
                  if (any.id > test.run) {
                    if (!test.stun || test.stun.end) {
                      test.stun = tmp.on('stun');
                      test.stun = test.stun && test.stun.last;
                    }
                    if (test.stun && !test.stun.end) {
                      //if(odd && u === data){ return }
                      //if(u === msg.put){ return } // "not found" acks will be found if there is stun, so ignore these.
                      (test.stun.add || (test.stun.add = {}))[id] =
                        function () {
                          any(msg, eve, 1);
                        }; // add ourself to the stun callback list that is called at end of the write.
                      return;
                    }
                  }
                }
                if (/*odd &&*/ u === data) {
                  f = 0;
                } // if data not found, keep waiting/trying.
                /*if(f && u === data){
									cat.on('out', opt.out);
									return;
								}*/
                if ((tmp = root.hatch) && !tmp.end && u === opt.hatch && !f) {
                  // quick hack! // What's going on here? Because data is streamed, we get things one by one, but a lot of developers would rather get a callback after each batch instead, so this does that by creating a wait list per chain id that is then called at the end of the batch by the hatch code in the root put listener.
                  if (wait[at.$._.id]) {
                    return;
                  }
                  wait[at.$._.id] = 1;
                  tmp.push(function () {
                    any(msg, eve, 1);
                  });
                  return;
                }
                wait = {}; // end quick hack.
              }
              // call:
              if (root.pass) {
                if (root.pass[id + at.id]) {
                  return;
                }
                root.pass[id + at.id] = 1;
              }
              if (opt.on) {
                opt.ok.call(at.$, data, at.get, msg, eve || any);
                return;
              } // TODO: Also consider breaking `this` since a lot of people do `=>` these days and `.call(` has slower performance.
              if (opt.v2020) {
                opt.ok(msg, eve || any);
                return;
              }
              Object.keys(msg).forEach(function (k) {
                tmp[k] = msg[k];
              }, (tmp = {}));
              msg = tmp;
              msg.put = data; // 2019 COMPATIBILITY! TODO: GET RID OF THIS!
              opt.ok.call(opt.as, msg, eve || any); // is this the right
            }
            any.at = cat;
            //(cat.any||(cat.any=function(msg){ setTimeout.each(Object.keys(cat.any||''), function(act){ (act = cat.any[act]) && act(msg) },0,99) }))[id = String.random(7)] = any; // maybe switch to this in future?
            (cat.any || (cat.any = {}))[(id = String.random(7))] = any;
            any.off = function () {
              any.stun = 1;
              if (!cat.any) {
                return;
              }
              delete cat.any[id];
            };
            any.rid = rid; // logic from old version, can we clean it up now?
            any.id = opt.run || ++root.once; // used in callback to check if we are earlier than a write. // will this ever cause an integer overflow?
            tmp = root.pass;
            (root.pass = {})[id] = 1; // Explanation: test trade-offs want to prevent recursion so we add/remove pass flag as it gets fulfilled to not repeat, however map map needs many pass flags - how do we reconcile?
            opt.out = opt.out || { get: {} };
            cat.on('out', opt.out);
            root.pass = tmp;
            return gun;
          } else if ('number' == typeof key) {
            return this.get('' + key, cb, as);
          } else if ('string' == typeof (tmp = valid(key))) {
            return this.get(tmp, cb, as);
          } else if ((tmp = this.get.next)) {
            gun = tmp(this, key);
          }
          if (!gun) {
            (gun = this.chain())._.err = {
              err: Gun.log('Invalid get request!', key),
            }; // CLEAN UP
            if (cb) {
              cb.call(gun, gun._.err);
            }
            return gun;
          }
          if (cb && 'function' == typeof cb) {
            gun.get(cb, as);
          }
          return gun;
        };
        function cache(key, back) {
          var cat = back._,
            next = cat.next,
            gun = back.chain(),
            at = gun._;
          if (!next) {
            next = cat.next = {};
          }
          next[(at.get = key)] = at;
          if (back === cat.root.$) {
            at.soul = key;
            //at.put = {};
          } else if (cat.soul || cat.has) {
            at.has = key;
            //if(obj_has(cat.put, key)){
            //at.put = cat.put[key];
            //}
          }
          return at;
        }
        function soul(gun, cb, opt, as) {
          var cat = gun._,
            acks = 0,
            tmp;
          if ((tmp = cat.soul || cat.link)) {
            return cb(tmp, as, cat);
          }
          if (cat.jam) {
            return cat.jam.push([cb, as]);
          }
          cat.jam = [[cb, as]];
          gun.get(
            function go(msg, eve) {
              if (
                u === msg.put &&
                !cat.root.opt.super &&
                (tmp = Object.keys(cat.root.opt.peers).length) &&
                ++acks <= tmp
              ) {
                // TODO: super should not be in core code, bring AXE up into core instead to fix? // TODO: .keys( is slow
                return;
              }
              eve.rid(msg);
              var at = ((at = msg.$) && at._) || {},
                i = 0,
                as;
              tmp = cat.jam;
              delete cat.jam; // tmp = cat.jam.splice(0, 100);
              //if(tmp.length){ setTimeout(function(){ go(msg, eve) }) }
              while ((as = tmp[i++])) {
                //Gun.obj.map(tmp, function(as, cb){
                var cb = as[0];
                as = as[1];
                cb &&
                  cb(
                    at.link ||
                      at.soul ||
                      Gun.valid(msg.put) ||
                      ((msg.put || {})._ || {})['#'],
                    as,
                    msg,
                    eve
                  );
              } //);
            },
            { out: { get: { '.': true } } }
          );
          return gun;
        }
        function rid(at) {
          var cat = this.at || this.on;
          if (!at || cat.soul || cat.has) {
            return this.off();
          }
          if (!(at = (at = (at = at.$ || at)._ || at).id)) {
            return;
          }
          cat.map;
          var seen;
          //if(!map || !(tmp = map[at]) || !(tmp = tmp.at)){ return }
          if ((seen = this.seen || (this.seen = {}))[at]) {
            return true;
          }
          seen[at] = true;
          return;
        }
        var empty = {},
          valid = Gun.valid,
          u;
      })(USE, './get');
      USE(function (module) {
        var Gun = USE('./root');
        Gun.chain.put = function (data, cb, as) {
          // I rewrote it :)
          var gun = this,
            at = gun._,
            root = at.root;
          as = as || {};
          as.root = at.root;
          as.run || (as.run = root.once);
          stun(as, at.id); // set a flag for reads to check if this chain is writing.
          as.ack = as.ack || cb;
          as.via = as.via || gun;
          as.data = as.data || data;
          as.soul || (as.soul = at.soul || ('string' == typeof cb && cb));
          var s = (as.state = as.state || Gun.state());
          if ('function' == typeof data) {
            data(function (d) {
              as.data = d;
              gun.put(u, u, as);
            });
            return gun;
          }
          if (!as.soul) {
            return get(as), gun;
          }
          as.$ = root.$.get(as.soul); // TODO: This may not allow user chaining and similar?
          as.todo = [{ it: as.data, ref: as.$ }];
          as.turn = as.turn || turn;
          as.ran = as.ran || ran;
          //var path = []; as.via.back(at => { at.get && path.push(at.get.slice(0,9)) }); path = path.reverse().join('.');
          // TODO: Perf! We only need to stun chains that are being modified, not necessarily written to.
          (function walk() {
            var to = as.todo,
              at = to.pop(),
              d = at.it;
            at.ref && at.ref._.id;
            var v, k, cat, tmp, g;
            stun(as, at.ref);
            if ((tmp = at.todo)) {
              k = tmp.pop();
              d = d[k];
              if (tmp.length) {
                to.push(at);
              }
            }
            k && (to.path || (to.path = [])).push(k);
            if (!(v = valid(d)) && !(g = Gun.is(d))) {
              if (!Object.plain(d)) {
                ran.err(
                  as,
                  'Invalid data: ' +
                    check(d) +
                    ' at ' +
                    (as.via.back(function (at) {
                      at.get && tmp.push(at.get);
                    }, (tmp = [])) || tmp.join('.')) +
                    '.' +
                    (to.path || []).join('.')
                );
                return;
              }
              var seen = as.seen || (as.seen = []),
                i = seen.length;
              while (i--) {
                if (d === (tmp = seen[i]).it) {
                  v = d = tmp.link;
                  break;
                }
              }
            }
            if (k && v) {
              at.node = state_ify(at.node, k, s, d);
            } // handle soul later.
            else {
              if (!as.seen) {
                ran.err(
                  as,
                  'Data at root of graph must be a node (an object).'
                );
                return;
              }
              as.seen.push(
                (cat = {
                  it: d,
                  link: {},
                  todo: g ? [] : Object.keys(d).sort().reverse(),
                  path: (to.path || []).slice(),
                  up: at,
                })
              ); // Any perf reasons to CPU schedule this .keys( ?
              at.node = state_ify(at.node, k, s, cat.link);
              !g && cat.todo.length && to.push(cat);
              // ---------------
              var id = as.seen.length;
              (as.wait || (as.wait = {}))[id] = '';
              tmp = (cat.ref = g ? d : k ? at.ref.get(k) : at.ref)._;
              (tmp = (d && (d._ || '')['#']) || tmp.soul || tmp.link)
                ? resolve({ soul: tmp })
                : cat.ref.get(resolve, {
                    run: as.run,
                    /*hatch: 0,*/ v2020: 1,
                    out: { get: { '.': ' ' } },
                  }); // TODO: BUG! This should be resolve ONLY soul to prevent full data from being loaded. // Fixed now?
              //setTimeout(function(){ if(F){ return } console.log("I HAVE NOT BEEN CALLED!", path, id, cat.ref._.id, k) }, 9000); var F; // MAKE SURE TO ADD F = 1 below!
              function resolve(msg, eve) {
                var end = cat.link['#'];
                if (eve) {
                  eve.off();
                  eve.rid(msg);
                } // TODO: Too early! Check all peers ack not found.
                // TODO: BUG maybe? Make sure this does not pick up a link change wipe, that it uses the changign link instead.
                var soul =
                  end ||
                  msg.soul ||
                  (tmp = (msg.$$ || msg.$)._ || '').soul ||
                  tmp.link ||
                  ((tmp = tmp.put || '')._ || '')['#'] ||
                  tmp['#'] ||
                  ((tmp = msg.put || '') && msg.$$
                    ? tmp['#']
                    : (tmp['='] || tmp[':'] || '')['#']);
                !end && stun(as, msg.$);
                if (!soul && !at.link['#']) {
                  // check soul link above us
                  (at.wait || (at.wait = [])).push(function () {
                    resolve(msg, eve);
                  }); // wait
                  return;
                }
                if (!soul) {
                  soul = [];
                  (msg.$$ || msg.$).back(function (at) {
                    if ((tmp = at.soul || at.link)) {
                      return soul.push(tmp);
                    }
                    soul.push(at.get);
                  });
                  soul = soul.reverse().join('/');
                }
                cat.link['#'] = soul;
                !g &&
                  (((as.graph || (as.graph = {}))[soul] =
                    cat.node || (cat.node = { _: {} }))._['#'] = soul);
                delete as.wait[id];
                cat.wait &&
                  setTimeout.each(cat.wait, function (cb) {
                    cb && cb();
                  });
                as.ran(as);
              } // ---------------
            }
            if (!to.length) {
              return as.ran(as);
            }
            as.turn(walk);
          })();
          return gun;
        };

        function stun(as, id) {
          if (!id) {
            return;
          }
          id = (id._ || '').id || id;
          var run = as.root.stun || (as.root.stun = { on: Gun.on }),
            test = {},
            tmp;
          as.stun || (as.stun = run.on('stun', function () {}));
          if ((tmp = run.on('' + id))) {
            tmp.the.last.next(test);
          }
          if (test.run >= as.run) {
            return;
          }
          run.on('' + id, function (test) {
            if (as.stun.end) {
              this.off();
              this.to.next(test);
              return;
            }
            test.run = test.run || as.run;
            test.stun = test.stun || as.stun;
            return;
          });
        }

        function ran(as) {
          if (as.err) {
            ran.end(as.stun, as.root);
            return;
          } // move log handle here.
          if (as.todo.length || as.end || !Object.empty(as.wait)) {
            return;
          }
          as.end = 1;
          //(as.retry = function(){ as.acks = 0;
          var cat = as.$.back(-1)._,
            root = cat.root,
            ask = cat.ask(function (ack) {
              root.on('ack', ack);
              if (ack.err && !ack.lack) {
                Gun.log(ack);
              }
              if (++acks > (as.acks || 0)) {
                this.off();
              } // Adjustable ACKs! Only 1 by default.
              if (!as.ack) {
                return;
              }
              as.ack(ack, this);
            }, as.opt),
            acks = 0,
            stun = as.stun,
            tmp;
          (tmp = function () {
            // this is not official yet, but quick solution to hack in for now.
            if (!stun) {
              return;
            }
            ran.end(stun, root);
            setTimeout.each(
              Object.keys((stun = stun.add || '')),
              function (cb) {
                if ((cb = stun[cb])) {
                  cb();
                }
              }
            ); // resume the stunned reads // Any perf reasons to CPU schedule this .keys( ?
          }).hatch = tmp; // this is not official yet ^
          //console.log(1, "PUT", as.run, as.graph);
          if (as.ack && !as.ok) {
            as.ok = as.acks || 9;
          } // TODO: In future! Remove this! This is just old API support.
          as.via._.on('out', {
            put: (as.out = as.graph),
            ok: as.ok && { '@': as.ok + 1 },
            opt: as.opt,
            '#': ask,
            _: tmp,
          });
          //})();
        }
        ran.end = function (stun, root) {
          stun.end = noop; // like with the earlier id, cheaper to make this flag a function so below callbacks do not have to do an extra type check.
          if (stun.the.to === stun && stun === stun.the.last) {
            delete root.stun;
          }
          stun.off();
        };
        ran.err = function (as, err) {
          (as.ack || noop).call(
            as,
            (as.out = { err: (as.err = Gun.log(err)) })
          );
          as.ran(as);
        };

        function get(as) {
          var at = as.via._,
            tmp;
          as.via = as.via.back(function (at) {
            if (at.soul || !at.get) {
              return at.$;
            }
            tmp = as.data;
            (as.data = {})[at.get] = tmp;
          });
          if (!as.via || !as.via._.soul) {
            as.via = at.root.$.get(
              ((as.data || '')._ || '')['#'] || at.$.back('opt.uuid')()
            );
          }
          as.via.put(as.data, as.ack, as);

          return;
        }
        function check(d, tmp) {
          return (d && (tmp = d.constructor) && tmp.name) || typeof d;
        }

        var u,
          noop = function () {},
          turn = setTimeout.turn,
          valid = Gun.valid,
          state_ify = Gun.state.ify;
      })(USE, './put');
      USE(function (module) {
        var Gun = USE('./root');
        USE('./chain');
        USE('./back');
        USE('./put');
        USE('./get');
        module.exports = Gun;
      })(USE, './index');
      USE(function (module) {
        var Gun = USE('./index');
        Gun.chain.on = function (tag, arg, eas, as) {
          // don't rewrite!
          var gun = this,
            cat = gun._;
          cat.root;
          var act;
          if (typeof tag === 'string') {
            if (!arg) {
              return cat.on(tag);
            }
            act = cat.on(tag, arg, eas || cat, as);
            if (eas && eas.$) {
              (eas.subs || (eas.subs = [])).push(act);
            }
            return gun;
          }
          var opt = arg;
          (opt = true === opt ? { change: true } : opt || {}).not = 1;
          opt.on = 1;
          gun.get(tag, opt);
          /*gun.get(function on(data,key,msg,eve){ var $ = this;
						if(tmp = root.hatch){ // quick hack!
							if(wait[$._.id]){ return } wait[$._.id] = 1;
							tmp.push(function(){on.call($, data,key,msg,eve)});
							return;
						}; wait = {}; // end quick hack.
						tag.call($, data,key,msg,eve);
					}, opt); // TODO: PERF! Event listener leak!!!?*/
          /*
					function one(msg, eve){
						if(one.stun){ return }
						var at = msg.$._, data = at.put, tmp;
						if(tmp = at.link){ data = root.$.get(tmp)._.put }
						if(opt.not===u && u === data){ return }
						if(opt.stun===u && (tmp = root.stun) && (tmp = tmp[at.id] || tmp[at.back.id]) && !tmp.end){ // Remember! If you port this into `.get(cb` make sure you allow stun:0 skip option for `.put(`.
							tmp[id] = function(){one(msg,eve)};
							return;
						}
						//tmp = one.wait || (one.wait = {}); console.log(tmp[at.id] === ''); if(tmp[at.id] !== ''){ tmp[at.id] = tmp[at.id] || setTimeout(function(){tmp[at.id]='';one(msg,eve)},1); return } delete tmp[at.id];
						// call:
						if(opt.as){
							opt.ok.call(opt.as, msg, eve || one);
						} else {
							opt.ok.call(at.$, data, msg.get || at.get, msg, eve || one);
						}
					};
					one.at = cat;
					(cat.act||(cat.act={}))[id = String.random(7)] = one;
					one.off = function(){ one.stun = 1; if(!cat.act){ return } delete cat.act[id] }
					cat.on('out', {get: {}});*/
          return gun;
        };
        // Rules:
        // 1. If cached, should be fast, but not read while write.
        // 2. Should not retrigger other listeners, should get triggered even if nothing found.
        // 3. If the same callback passed to many different once chains, each should resolve - an unsubscribe from the same callback should not effect the state of the other resolving chains, if you do want to cancel them all early you should mutate the callback itself with a flag & check for it at top of callback
        Gun.chain.once = function (cb, opt) {
          opt = opt || {}; // avoid rewriting
          if (!cb) {
            return none(this);
          }
          var gun = this,
            cat = gun._,
            root = cat.root;
          cat.put;
          var id = String.random(7),
            tmp;
          gun.get(
            function (data, key, msg, eve) {
              var $ = this,
                at = $._,
                one = at.one || (at.one = {});
              if (eve.stun) {
                return;
              }
              if ('' === one[id]) {
                return;
              }
              if (true === (tmp = Gun.valid(data))) {
                once();
                return;
              }
              if ('string' == typeof tmp) {
                return;
              } // TODO: BUG? Will this always load?
              clearTimeout((cat.one || '')[id]); // clear "not found" since they only get set on cat.
              clearTimeout(one[id]);
              one[id] = setTimeout(once, opt.wait || 99); // TODO: Bug? This doesn't handle plural chains.
              function once(f) {
                if (!at.has && !at.soul) {
                  at = { put: data, get: key };
                } // handles non-core messages.
                if (u === (tmp = at.put)) {
                  tmp = ((msg.$$ || '')._ || '').put;
                }
                if ('string' == typeof Gun.valid(tmp)) {
                  tmp = root.$.get(tmp)._.put;
                  if (tmp === u && !f) {
                    one[id] = setTimeout(function () {
                      once(1);
                    }, opt.wait || 99); // TODO: Quick fix. Maybe use ack count for more predictable control?
                    return;
                  }
                }
                //console.log("AND VANISHED", data);
                if (eve.stun) {
                  return;
                }
                if ('' === one[id]) {
                  return;
                }
                one[id] = '';
                if (cat.soul || cat.has) {
                  eve.off();
                } // TODO: Plural chains? // else { ?.off() } // better than one check?
                cb.call($, tmp, at.get);
                clearTimeout(one[id]); // clear "not found" since they only get set on cat. // TODO: This was hackily added, is it necessary or important? Probably not, in future try removing this. Was added just as a safety for the `&& !f` check.
              }
            },
            { on: 1 }
          );
          return gun;
        };
        function none(gun, opt, chain) {
          Gun.log.once(
            'valonce',
            'Chainable val is experimental, its behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.'
          );
          (chain = gun.chain())._.nix = gun.once(function (data, key) {
            chain._.on('in', this._);
          });
          chain._.lex = gun._.lex; // TODO: Better approach in future? This is quick for now.
          return chain;
        }

        Gun.chain.off = function () {
          // make off more aggressive. Warning, it might backfire!
          var gun = this,
            at = gun._,
            tmp;
          var cat = at.back;
          if (!cat) {
            return;
          }
          at.ack = 0; // so can resubscribe.
          if ((tmp = cat.next)) {
            if (tmp[at.get]) {
              delete tmp[at.get];
            }
          }
          // TODO: delete cat.one[map.id]?
          if ((tmp = cat.any)) {
            delete cat.any;
            cat.any = {};
          }
          if ((tmp = cat.ask)) {
            delete tmp[at.get];
          }
          if ((tmp = cat.put)) {
            delete tmp[at.get];
          }
          if ((tmp = at.soul)) {
            delete cat.root.graph[tmp];
          }
          if ((tmp = at.map)) {
            Object.keys(tmp).forEach(function (i, at) {
              at = tmp[i]; //obj_map(tmp, function(at){
              if (at.link) {
                cat.root.$.get(at.link).off();
              }
            });
          }
          if ((tmp = at.next)) {
            Object.keys(tmp).forEach(function (i, neat) {
              neat = tmp[i]; //obj_map(tmp, function(neat){
              neat.$.off();
            });
          }
          at.on('off', {});
          return gun;
        };
        var u;
      })(USE, './on');
      USE(function (module) {
        var Gun = USE('./index'),
          next = Gun.chain.get.next;
        Gun.chain.get.next = function (gun, lex) {
          var tmp;
          if (!Object.plain(lex)) {
            return (next || noop)(gun, lex);
          }
          if ((tmp = ((tmp = lex['#']) || '')['='] || tmp)) {
            return gun.get(tmp);
          }
          (tmp = gun.chain()._).lex = lex; // LEX!
          gun.on('in', function (eve) {
            if (
              String.match(
                eve.get || (eve.put || '')['.'],
                lex['.'] || lex['#'] || lex
              )
            ) {
              tmp.on('in', eve);
            }
            this.to.next(eve);
          });
          return tmp.$;
        };
        Gun.chain.map = function (cb, opt, t) {
          var gun = this,
            cat = gun._,
            lex,
            chain;
          if (Object.plain(cb)) {
            lex = cb['.'] ? cb : { '.': cb };
            cb = u;
          }
          if (!cb) {
            if ((chain = cat.each)) {
              return chain;
            }
            (cat.each = chain = gun.chain())._.lex =
              lex || chain._.lex || cat.lex;
            chain._.nix = gun.back('nix');
            gun.on('in', map, chain._);
            return chain;
          }
          Gun.log.once(
            'mapfn',
            'Map functions are experimental, their behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.'
          );
          chain = gun.chain();
          gun.map().on(function (data, key, msg, eve) {
            var next = (cb || noop).call(this, data, key, msg, eve);
            if (u === next) {
              return;
            }
            if (data === next) {
              return chain._.on('in', msg);
            }
            if (Gun.is(next)) {
              return chain._.on('in', next._);
            }
            var tmp = {};
            Object.keys(msg.put).forEach(function (k) {
              tmp[k] = msg.put[k];
            }, tmp);
            tmp['='] = next;
            chain._.on('in', { get: key, put: tmp });
          });
          return chain;
        };
        function map(msg) {
          this.to.next(msg);
          var cat = this.as,
            gun = msg.$,
            at = gun._,
            put = msg.put,
            tmp;
          if (!at.soul && !msg.$$) {
            return;
          } // this line took hundreds of tries to figure out. It only works if core checks to filter out above chains during link tho. This says "only bother to map on a node" for this layer of the chain. If something is not a node, map should not work.
          if (
            (tmp = cat.lex) &&
            !String.match(
              msg.get || (put || '')['.'],
              tmp['.'] || tmp['#'] || tmp
            )
          ) {
            return;
          }
          Gun.on.link(msg, cat);
        }
        var noop = function () {},
          u;
      })(USE, './map');
      USE(function (module) {
        var Gun = USE('./index');
        Gun.chain.set = function (item, cb, opt) {
          var gun = this,
            root = gun.back(-1),
            soul,
            tmp;
          cb = cb || function () {};
          opt = opt || {};
          opt.item = opt.item || item;
          if ((soul = ((item || '')._ || '')['#'])) {
            (item = {})['#'] = soul;
          } // check if node, make link.
          if ('string' == typeof (tmp = Gun.valid(item))) {
            return gun.get((soul = tmp)).put(item, cb, opt);
          } // check if link
          if (!Gun.is(item)) {
            if (Object.plain(item)) {
              item = root.get((soul = gun.back('opt.uuid')())).put(item);
            }
            return gun.get(soul || root.back('opt.uuid')(7)).put(item, cb, opt);
          }
          gun.put(function (go) {
            item.get(function (soul, o, msg) {
              // TODO: BUG! We no longer have this option? & go error not handled?
              if (!soul) {
                return cb.call(gun, {
                  err: Gun.log(
                    'Only a node can be linked! Not "' + msg.put + '"!'
                  ),
                });
              }
              (tmp = {})[soul] = { '#': soul };
              go(tmp);
            }, true);
          });
          return item;
        };
      })(USE, './set');
      USE(function (module) {
        USE('./shim');

        var noop = function () {};
        var parse =
          JSON.parseAsync ||
          function (t, cb, r) {
            var u,
              d = +new Date();
            try {
              cb(u, JSON.parse(t, r), json.sucks(+new Date() - d));
            } catch (e) {
              cb(e);
            }
          };
        var json =
          JSON.stringifyAsync ||
          function (v, cb, r, s) {
            var u,
              d = +new Date();
            try {
              cb(u, JSON.stringify(v, r, s), json.sucks(+new Date() - d));
            } catch (e) {
              cb(e);
            }
          };
        json.sucks = function (d) {
          if (d > 99) {
            console.log(
              'Warning: JSON blocking CPU detected. Add `gun/lib/yson.js` to fix.'
            );
            json.sucks = noop;
          }
        };

        function Mesh(root) {
          var mesh = function () {};
          var opt = root.opt || {};
          opt.log = opt.log || console.log;
          opt.gap = opt.gap || opt.wait || 0;
          opt.max =
            opt.max || (opt.memory ? opt.memory * 999 * 999 : 300000000) * 0.3;
          opt.pack = opt.pack || opt.max * 0.01 * 0.01;
          opt.puff = opt.puff || 9; // IDEA: do a start/end benchmark, divide ops/result.
          var puff = setTimeout.turn || setTimeout;

          var dup = root.dup,
            dup_check = dup.check,
            dup_track = dup.track;

          var hear = (mesh.hear = function (raw, peer) {
            if (!raw) {
              return;
            }
            if (opt.max <= raw.length) {
              return mesh.say({ dam: '!', err: 'Message too big!' }, peer);
            }
            if (mesh === this) {
              /*if('string' == typeof raw){ try{
								var stat = console.STAT || {};
								//console.log('HEAR:', peer.id, (raw||'').slice(0,250), ((raw||'').length / 1024 / 1024).toFixed(4));
								
								//console.log(setTimeout.turn.s.length, 'stacks', parseFloat((-(LT - (LT = +new Date))/1000).toFixed(3)), 'sec', parseFloat(((LT-ST)/1000 / 60).toFixed(1)), 'up', stat.peers||0, 'peers', stat.has||0, 'has', stat.memhused||0, stat.memused||0, stat.memax||0, 'heap mem max');
							}catch(e){ console.log('DBG err', e) }}*/
              hear.d += raw.length || 0;
              ++hear.c;
            } // STATS!
            var S = (peer.SH = +new Date());
            var tmp = raw[0],
              msg;
            //raw && raw.slice && console.log("hear:", ((peer.wire||'').headers||'').origin, raw.length, raw.slice && raw.slice(0,50)); //tc-iamunique-tc-package-ds1
            if ('[' === tmp) {
              parse(raw, function (err, msg) {
                if (err || !msg) {
                  return mesh.say(
                    { dam: '!', err: 'DAM JSON parse error.' },
                    peer
                  );
                }
                console.STAT &&
                  console.STAT(+new Date(), msg.length, '# on hear batch');
                var P = opt.puff;
                (function go() {
                  var S = +new Date();
                  var i = 0,
                    m;
                  while (i < P && (m = msg[i++])) {
                    mesh.hear(m, peer);
                  }
                  msg = msg.slice(i); // slicing after is faster than shifting during.
                  console.STAT && console.STAT(S, +new Date() - S, 'hear loop');
                  flush(peer); // force send all synchronously batched acks.
                  if (!msg.length) {
                    return;
                  }
                  puff(go, 0);
                })();
              });
              raw = ''; //
              return;
            }
            if (
              '{' === tmp ||
              ((raw['#'] || Object.plain(raw)) && (msg = raw))
            ) {
              if (msg) {
                return hear.one(msg, peer, S);
              }
              parse(raw, function (err, msg) {
                if (err || !msg) {
                  return mesh.say(
                    { dam: '!', err: 'DAM JSON parse error.' },
                    peer
                  );
                }
                hear.one(msg, peer, S);
              });
              return;
            }
          });
          hear.one = function (msg, peer, S) {
            // S here is temporary! Undo.
            var id, hash, tmp, ash, DBG;
            if (msg.DBG) {
              msg.DBG = DBG = { DBG: msg.DBG };
            }
            DBG && (DBG.h = S);
            DBG && (DBG.hp = +new Date());
            if (!(id = msg['#'])) {
              id = msg['#'] = String.random(9);
            }
            if ((tmp = dup_check(id))) {
              return;
            }
            // DAM logic:
            if (!(hash = msg['##']) && false && u !== msg.put); // disable hashing for now // TODO: impose warning/penalty instead (?)
            if (
              hash &&
              (tmp = msg['@'] || (msg.get && id)) &&
              dup.check((ash = tmp + hash))
            ) {
              return;
            } // Imagine A <-> B <=> (C & D), C & D reply with same ACK but have different IDs, B can use hash to dedup. Or if a GET has a hash already, we shouldn't ACK if same.
            (msg._ = function () {}).via = mesh.leap = peer;
            if ((tmp = msg['><']) && 'string' == typeof tmp) {
              tmp
                .slice(0, 99)
                .split(',')
                .forEach(function (k) {
                  this[k] = 1;
                }, (msg._.yo = {}));
            } // Peers already sent to, do not resend.
            // DAM ^
            if ((tmp = msg.dam)) {
              if ((tmp = mesh.hear[tmp])) {
                tmp(msg, peer, root);
              }
              dup_track(id);
              return;
            }
            if ((tmp = msg.ok)) {
              msg._.near = tmp['/'];
            }
            var S = +new Date();
            DBG && (DBG.is = S);
            peer.SI = id;
            dup_track.ed = function (d) {
              if (id !== d) {
                return;
              }
              dup_track.ed = 0;
              if (!(d = dup.s[id])) {
                return;
              }
              d.via = peer;
              if (msg.get) {
                d.it = msg;
              }
            };
            root.on('in', (mesh.last = msg));
            DBG && (DBG.hd = +new Date());
            console.STAT &&
              console.STAT(
                S,
                +new Date() - S,
                msg.get ? 'msg get' : msg.put ? 'msg put' : 'msg'
              );
            dup_track(id); // in case 'in' does not call track.
            if (ash) {
              dup_track(ash);
            } //dup.track(tmp+hash, true).it = it(msg);
            mesh.leap = mesh.last = null; // warning! mesh.leap could be buggy.
          };
          hear.c = hear.d = 0;
          (function () {
            var SMIA = 0;
            var loop;
            mesh.hash = function (msg, peer) {
              var h, s, t;
              var S = +new Date();
              json(
                msg.put,
                function hash(err, text) {
                  var ss = (s || (s = t = text || '')).slice(0, 32768); // 1024 * 32
                  h = String.hash(ss, h);
                  s = s.slice(32768);
                  if (s) {
                    puff(hash, 0);
                    return;
                  }
                  console.STAT &&
                    console.STAT(S, +new Date() - S, 'say json+hash');
                  msg._.$put = t;
                  msg['##'] = h;
                  mesh.say(msg, peer);
                  delete msg._.$put;
                },
                sort
              );
            };
            function sort(k, v) {
              var tmp;
              if (!(v instanceof Object)) {
                return v;
              }
              Object.keys(v)
                .sort()
                .forEach(sorta, { to: (tmp = {}), on: v });
              return tmp;
            }
            function sorta(k) {
              this.to[k] = this.on[k];
            }

            mesh.say = function (msg, peer) {
              var tmp;
              if ((tmp = this) && (tmp = tmp.to) && tmp.next) {
                tmp.next(msg);
              } // compatible with middleware adapters.
              if (!msg) {
                return false;
              }
              var id,
                hash,
                raw,
                ack = msg['@'];
              //if(opt.super && (!ack || !msg.put)){ return } // TODO: MANHATTAN STUB //OBVIOUSLY BUG! But squelch relay. // :( get only is 100%+ CPU usage :(
              var meta = msg._ || (msg._ = function () {});
              var DBG = msg.DBG,
                S = +new Date();
              meta.y = meta.y || S;
              if (!peer) {
                DBG && (DBG.y = S);
              }
              if (!(id = msg['#'])) {
                id = msg['#'] = String.random(9);
              }
              !loop && dup_track(id); //.it = it(msg); // track for 9 seconds, default. Earth<->Mars would need more! // always track, maybe move this to the 'after' logic if we split function.
              //if(msg.put && (msg.err || (dup.s[id]||'').err)){ return false } // TODO: in theory we should not be able to stun a message, but for now going to check if it can help network performance preventing invalid data to relay.
              if (!(hash = msg['##']) && u !== msg.put && !meta.via && ack) {
                mesh.hash(msg, peer);
                return;
              } // TODO: Should broadcasts be hashed?
              if (!peer && ack) {
                peer =
                  ((tmp = dup.s[ack]) &&
                    (tmp.via ||
                      ((tmp = tmp.it) && (tmp = tmp._) && tmp.via))) ||
                  ((tmp = mesh.last) && ack === tmp['#'] && mesh.leap);
              } // warning! mesh.leap could be buggy! mesh last check reduces this. // TODO: CLEAN UP THIS LINE NOW? `.it` should be reliable.
              if (!peer && ack) {
                // still no peer, then ack daisy chain 'tunnel' got lost.
                if (dup.s[ack]) {
                  return;
                } // in dups but no peer hints that this was ack to ourself, ignore.
                console.STAT &&
                  console.STAT(+new Date(), ++SMIA, 'total no peer to ack to'); // TODO: Delete this now. Dropping lost ACKs is protocol fine now.
                return false;
              } // TODO: Temporary? If ack via trace has been lost, acks will go to all peers, which trashes browser bandwidth. Not relaying the ack will force sender to ask for ack again. Note, this is technically wrong for mesh behavior.
              if (
                ack &&
                !msg.put &&
                !hash &&
                ((dup.s[ack] || '').it || '')['##']
              ) {
                return false;
              } // If we're saying 'not found' but a relay had data, do not bother sending our not found. // Is this correct, return false? // NOTE: ADD PANIC TEST FOR THIS!
              if (!peer && mesh.way) {
                return mesh.way(msg);
              }
              DBG && (DBG.yh = +new Date());
              if (!(raw = meta.raw)) {
                mesh.raw(msg, peer);
                return;
              }
              DBG && (DBG.yr = +new Date());
              if (!peer || !peer.id) {
                if (!Object.plain(peer || opt.peers)) {
                  return false;
                }
                var S = +new Date();
                opt.puff;
                var ps = opt.peers,
                  pl = Object.keys(peer || opt.peers || {}); // TODO: .keys( is slow
                console.STAT && console.STAT(S, +new Date() - S, 'peer keys');
                (function go() {
                  var S = +new Date();
                  //Type.obj.map(peer || opt.peers, each); // in case peer is a peer list.
                  loop = 1;
                  var wr = meta.raw;
                  meta.raw = raw; // quick perf hack
                  var i = 0,
                    p;
                  while (i < 9 && (p = (pl || '')[i++])) {
                    if (!(p = ps[p] || (peer || '')[p])) {
                      continue;
                    }
                    mesh.say(msg, p);
                  }
                  meta.raw = wr;
                  loop = 0;
                  pl = pl.slice(i); // slicing after is faster than shifting during.
                  console.STAT && console.STAT(S, +new Date() - S, 'say loop');
                  if (!pl.length) {
                    return;
                  }
                  puff(go, 0);
                  ack && dup_track(ack); // keep for later
                })();
                return;
              }
              // TODO: PERF: consider splitting function here, so say loops do less work.
              if (!peer.wire && mesh.wire) {
                mesh.wire(peer);
              }
              if (id === peer.last) {
                return;
              }
              peer.last = id; // was it just sent?
              if (peer === meta.via) {
                return false;
              } // don't send back to self.
              if (
                (tmp = meta.yo) &&
                (tmp[peer.url] || tmp[peer.pid] || tmp[peer.id]) /*&& !o*/
              ) {
                return false;
              }
              console.STAT &&
                console.STAT(
                  S,
                  ((DBG || meta).yp = +new Date()) - (meta.y || S),
                  'say prep'
                );
              !loop && ack && dup_track(ack); // streaming long responses needs to keep alive the ack.
              if (peer.batch) {
                peer.tail = (tmp = peer.tail || 0) + raw.length;
                if (peer.tail <= opt.pack) {
                  peer.batch += (tmp ? ',' : '') + raw;
                  return;
                }
                flush(peer);
              }
              peer.batch = '['; // Prevents double JSON!
              var ST = +new Date();
              setTimeout(function () {
                console.STAT && console.STAT(ST, +new Date() - ST, '0ms TO');
                flush(peer);
              }, opt.gap); // TODO: queuing/batching might be bad for low-latency video game performance! Allow opt out?
              send(raw, peer);
              console.STAT &&
                ack === peer.SI &&
                console.STAT(S, +new Date() - peer.SH, 'say ack');
            };
            mesh.say.c = mesh.say.d = 0;
            // TODO: this caused a out-of-memory crash!
            mesh.raw = function (msg, peer) {
              // TODO: Clean this up / delete it / move logic out!
              if (!msg) {
                return '';
              }
              var meta = msg._ || {},
                put,
                tmp;
              if ((tmp = meta.raw)) {
                return tmp;
              }
              if ('string' == typeof msg) {
                return msg;
              }
              var hash = msg['##'],
                ack = msg['@'];
              if (hash && ack) {
                if (!meta.via && dup_check(ack + hash)) {
                  return false;
                } // for our own out messages, memory & storage may ack the same thing, so dedup that. Tho if via another peer, we already tracked it upon hearing, so this will always trigger false positives, so don't do that!
                if ((tmp = (dup.s[ack] || '').it)) {
                  if (hash === tmp['##']) {
                    return false;
                  } // if ask has a matching hash, acking is optional.
                  if (!tmp['##']) {
                    tmp['##'] = hash;
                  } // if none, add our hash to ask so anyone we relay to can dedup. // NOTE: May only check against 1st ack chunk, 2nd+ won't know and still stream back to relaying peers which may then dedup. Any way to fix this wasted bandwidth? I guess force rate limiting breaking change, that asking peer has to ask for next lexical chunk.
                }
              }
              if (!msg.dam && !msg['@']) {
                var i = 0,
                  to = [];
                tmp = opt.peers;
                for (var k in tmp) {
                  var p = tmp[k]; // TODO: Make it up peers instead!
                  to.push(p.url || p.pid || p.id);
                  if (++i > 6) {
                    break;
                  }
                }
                if (i > 1) {
                  msg['><'] = to.join();
                } // TODO: BUG! This gets set regardless of peers sent to! Detect?
              }
              if (msg.put && (tmp = msg.ok)) {
                msg.ok = {
                  '@': (tmp['@'] || 1) - 1,
                  '/': tmp['/'] == msg._.near ? mesh.near : tmp['/'],
                };
              }
              if ((put = meta.$put)) {
                tmp = {};
                Object.keys(msg).forEach(function (k) {
                  tmp[k] = msg[k];
                });
                tmp.put = ':])([:';
                json(tmp, function (err, raw) {
                  if (err) {
                    return;
                  } // TODO: Handle!!
                  var S = +new Date();
                  tmp = raw.indexOf('"put":":])([:"');
                  res(
                    u,
                    (raw = raw.slice(0, tmp + 6) + put + raw.slice(tmp + 14))
                  );
                  console.STAT && console.STAT(S, +new Date() - S, 'say slice');
                });
                return;
              }
              json(msg, res);
              function res(err, raw) {
                if (err) {
                  return;
                } // TODO: Handle!!
                meta.raw = raw; //if(meta && (raw||'').length < (999 * 99)){ meta.raw = raw } // HNPERF: If string too big, don't keep in memory.
                mesh.say(msg, peer);
              }
            };
          })();

          function flush(peer) {
            var tmp = peer.batch,
              t = 'string' == typeof tmp;
            if (t) {
              tmp += ']';
            } // TODO: Prevent double JSON!
            peer.batch = peer.tail = null;
            if (!tmp) {
              return;
            }
            if (t ? 3 > tmp.length : !tmp.length) {
              return;
            } // TODO: ^
            if (!t) {
              try {
                tmp = 1 === tmp.length ? tmp[0] : JSON.stringify(tmp);
              } catch (e) {
                return opt.log('DAM JSON stringify error', e);
              }
            }
            if (!tmp) {
              return;
            }
            send(tmp, peer);
          }
          // for now - find better place later.
          function send(raw, peer) {
            try {
              var wire = peer.wire;
              if (peer.say) {
                peer.say(raw);
              } else if (wire.send) {
                wire.send(raw);
              }
              mesh.say.d += raw.length || 0;
              ++mesh.say.c; // STATS!
            } catch (e) {
              (peer.queue = peer.queue || []).push(raw);
            }
          }

          mesh.near = 0;
          mesh.hi = function (peer) {
            var wire = peer.wire,
              tmp;
            if (!wire) {
              mesh.wire((peer.length && { url: peer, id: peer }) || peer);
              return;
            }
            if (peer.id) {
              opt.peers[peer.url || peer.id] = peer;
            } else {
              tmp = peer.id = peer.id || peer.url || String.random(9);
              mesh.say(
                { dam: '?', pid: root.opt.pid },
                (opt.peers[tmp] = peer)
              );
              delete dup.s[peer.last]; // IMPORTANT: see https://gun.eco/docs/DAM#self
            }
            if (!peer.met) {
              mesh.near++;
              peer.met = +new Date();
              root.on('hi', peer);
            }
            // @rogowski I need this here by default for now to fix go1dfish's bug
            tmp = peer.queue;
            peer.queue = [];
            setTimeout.each(
              tmp || [],
              function (msg) {
                send(msg, peer);
              },
              0,
              9
            );
            //Type.obj.native && Type.obj.native(); // dirty place to check if other JS polluted.
          };
          mesh.bye = function (peer) {
            peer.met && --mesh.near;
            delete peer.met;
            root.on('bye', peer);
            var tmp = +new Date();
            tmp = tmp - (peer.met || tmp);
            mesh.bye.time = ((mesh.bye.time || tmp) + tmp) / 2;
          };
          mesh.hear['!'] = function (msg, peer) {
            opt.log('Error:', msg.err);
          };
          mesh.hear['?'] = function (msg, peer) {
            if (msg.pid) {
              if (!peer.pid) {
                peer.pid = msg.pid;
              }
              if (msg['@']) {
                return;
              }
            }
            mesh.say({ dam: '?', pid: opt.pid, '@': msg['#'] }, peer);
            delete dup.s[peer.last]; // IMPORTANT: see https://gun.eco/docs/DAM#self
          };
          mesh.hear['mob'] = function (msg, peer) {
            // NOTE: AXE will overload this with better logic.
            if (!msg.peers) {
              return;
            }
            var peers = Object.keys(msg.peers),
              one = peers[(Math.random() * peers.length) >> 0];
            if (!one) {
              return;
            }
            mesh.bye(peer);
            mesh.hi(one);
          };

          root.on('create', function (root) {
            root.opt.pid = root.opt.pid || String.random(9);
            this.to.next(root);
            root.on('out', mesh.say);
          });

          root.on('bye', function (peer, tmp) {
            peer = opt.peers[peer.id || peer] || peer;
            this.to.next(peer);
            peer.bye
              ? peer.bye()
              : (tmp = peer.wire) && tmp.close && tmp.close();
            delete opt.peers[peer.id];
            peer.wire = null;
          });
          root.on('bye', function (peer, tmp) {
            this.to.next(peer);
            if ((tmp = console.STAT)) {
              tmp.peers = mesh.near;
            }
            if (!(tmp = peer.url)) {
              return;
            }
            setTimeout(function () {}, opt.lack || 9000);
          });
          root.on('hi', function (peer, tmp) {
            this.to.next(peer);
            if ((tmp = console.STAT)) {
              tmp.peers = mesh.near;
            }
            if (opt.super) {
              return;
            } // temporary (?) until we have better fix/solution?
            var souls = Object.keys(root.next || ''); // TODO: .keys( is slow
            if (souls.length > 9999 && !console.SUBS) {
              console.log(
                (console.SUBS =
                  'Warning: You have more than 10K live GETs, which might use more bandwidth than your screen can show - consider `.off()`.')
              );
            }
            setTimeout.each(souls, function (soul) {
              var node = root.next[soul];
              if (opt.super || (node.ask || '')['']) {
                mesh.say({ get: { '#': soul } }, peer);
                return;
              }
              setTimeout.each(Object.keys(node.ask || ''), function (key) {
                if (!key) {
                  return;
                }
                // is the lack of ## a !onion hint?
                mesh.say(
                  {
                    '##': String.hash((root.graph[soul] || '')[key]),
                    get: { '#': soul, '.': key },
                  },
                  peer
                );
                // TODO: Switch this so Book could route?
              });
            });
          });

          return mesh;
        }
        var u;

        try {
          module.exports = Mesh;
        } catch (e) {}
      })(USE, './mesh');
      USE(function (module) {
        var Gun = USE('./index');
        Gun.Mesh = USE('./mesh');

        // TODO: resync upon reconnect online/offline
        //window.ononline = window.onoffline = function(){ console.log('online?', navigator.onLine) }

        Gun.on('opt', function (root) {
          this.to.next(root);
          if (root.once) {
            return;
          }
          var opt = root.opt;
          if (false === opt.WebSocket) {
            return;
          }

          var env = Gun.window || {};
          var websocket =
            opt.WebSocket ||
            env.WebSocket ||
            env.webkitWebSocket ||
            env.mozWebSocket;
          if (!websocket) {
            return;
          }
          opt.WebSocket = websocket;

          var mesh = (opt.mesh = opt.mesh || Gun.Mesh(root));

          mesh.wire || opt.wire;
          mesh.wire = opt.wire = open;
          function open(peer) {
            try {
              if (!peer || !peer.url) {
                return wire && wire(peer);
              }
              var url = peer.url.replace(/^http/, 'ws');
              var wire = (peer.wire = new opt.WebSocket(url));
              wire.onclose = function () {
                reconnect(peer);
                opt.mesh.bye(peer);
              };
              wire.onerror = function (err) {
                reconnect(peer);
              };
              wire.onopen = function () {
                opt.mesh.hi(peer);
              };
              wire.onmessage = function (msg) {
                if (!msg) {
                  return;
                }
                opt.mesh.hear(msg.data || msg, peer);
              };
              return wire;
            } catch (e) {
              opt.mesh.bye(peer);
            }
          }

          setTimeout(function () {
            !opt.super && root.on('out', { dam: 'hi' });
          }, 1); // it can take a while to open a socket, so maybe no longer lazy load for perf reasons?

          var wait = 2 * 999;
          function reconnect(peer) {
            clearTimeout(peer.defer);
            if (!opt.peers[peer.url]) {
              return;
            }
            if (doc && peer.retry <= 0) {
              return;
            }
            peer.retry =
              (peer.retry || opt.retry + 1 || 60) -
              (-peer.tried + (peer.tried = +new Date()) < wait * 4 ? 1 : 0);
            peer.defer = setTimeout(function to() {
              if (doc && doc.hidden) {
                return setTimeout(to, wait);
              }
              open(peer);
            }, wait);
          }
          var doc = '' + u !== typeof document && document;
        });
        var u;
      })(USE, './websocket');
      USE(function (module) {
        if (typeof Gun === 'undefined') {
          return;
        }

        var noop = function () {},
          store;
        try {
          store = (Gun.window || noop).localStorage;
        } catch (e) {}
        if (!store) {
          Gun.log('Warning: No localStorage exists to persist data to!');
          store = {
            setItem: function (k, v) {
              this[k] = v;
            },
            removeItem: function (k) {
              delete this[k];
            },
            getItem: function (k) {
              return this[k];
            },
          };
        }
        var json =
          JSON.stringifyAsync ||
          function (v, cb, r, s) {
            var u;
            try {
              cb(u, JSON.stringify(v, r, s));
            } catch (e) {
              cb(e);
            }
          };

        Gun.on('create', function lg(root) {
          this.to.next(root);
          var opt = root.opt;
          root.graph;
          var acks = [],
            disk,
            to,
            size,
            stop;
          if (false === opt.localStorage) {
            return;
          }
          opt.prefix = opt.file || 'gun/';
          try {
            disk = lg[opt.prefix] =
              lg[opt.prefix] ||
              JSON.parse((size = store.getItem(opt.prefix))) ||
              {}; // TODO: Perf! This will block, should we care, since limited to 5MB anyways?
          } catch (e) {
            disk = lg[opt.prefix] = {};
          }
          size = (size || '').length;

          root.on('get', function (msg) {
            this.to.next(msg);
            var lex = msg.get,
              soul,
              data,
              tmp,
              u;
            if (!lex || !(soul = lex['#'])) {
              return;
            }
            data = disk[soul] || u;
            if (data && (tmp = lex['.']) && !Object.plain(tmp)) {
              // pluck!
              data = Gun.state.ify(
                {},
                tmp,
                Gun.state.is(data, tmp),
                data[tmp],
                soul
              );
            }
            //if(data){ (tmp = {})[soul] = data } // back into a graph.
            //setTimeout(function(){
            Gun.on.get.ack(msg, data); //root.on('in', {'@': msg['#'], put: tmp, lS:1});// || root.$});
            //}, Math.random() * 10); // FOR TESTING PURPOSES!
          });

          root.on('put', function (msg) {
            this.to.next(msg); // remember to call next middleware adapter
            var put = msg.put,
              soul = put['#'],
              key = put['.'],
              id = msg['#'],
              ok = msg.ok || ''; // pull data off wire envelope
            disk[soul] = Gun.state.ify(
              disk[soul],
              key,
              put['>'],
              put[':'],
              soul
            ); // merge into disk object
            if (stop && size > 4999880) {
              root.on('in', { '@': id, err: 'localStorage max!' });
              return;
            }
            //if(!msg['@']){ acks.push(id) } // then ack any non-ack write. // TODO: use batch id.
            if (
              !msg['@'] &&
              (!msg._.via || Math.random() < ok['@'] / ok['/'])
            ) {
              acks.push(id);
            } // then ack any non-ack write. // TODO: use batch id.
            if (to) {
              return;
            }
            to = setTimeout(flush, 9 + size / 333); // 0.1MB = 0.3s, 5MB = 15s
          });
          function flush() {
            if (!acks.length && ((setTimeout.turn || '').s || '').length) {
              setTimeout(flush, 99);
              return;
            } // defer if "busy" && no saves.
            var ack = acks;
            clearTimeout(to);
            to = false;
            acks = [];
            json(disk, function (err, tmp) {
              try {
                !err && store.setItem(opt.prefix, tmp);
              } catch (e) {
                err = stop = e || 'localStorage failure';
              }
              if (err) {
                Gun.log(
                  err +
                    " Consider using GUN's IndexedDB plugin for RAD for more storage space, https://gun.eco/docs/RAD#install"
                );
                root.on('localStorage:error', {
                  err: err,
                  get: opt.prefix,
                  put: disk,
                });
              }
              size = tmp.length;

              //if(!err && !Object.empty(opt.peers)){ return } // only ack if there are no peers. // Switch this to probabilistic mode
              setTimeout.each(
                ack,
                function (id) {
                  root.on('in', { '@': id, err: err, ok: 0 }); // localStorage isn't reliable, so make its `ok` code be a low number.
                },
                0,
                99
              );
            });
          }
        });
      })(USE, './localStorage');
    })();
    (function () {
      var u;
      if ('' + u == typeof Gun) {
        return;
      }
      var DEP = function (n) {
        console.warn(
          'Warning! Deprecated internal utility will break in next version:',
          n
        );
      };
      // Generic javascript utilities.
      var Type = Gun;
      //Type.fns = Type.fn = {is: function(fn){ return (!!fn && fn instanceof Function) }}
      Type.fn = Type.fn || {
        is: function (fn) {
          DEP('fn');
          return !!fn && 'function' == typeof fn;
        },
      };
      Type.bi = Type.bi || {
        is: function (b) {
          DEP('bi');
          return b instanceof Boolean || typeof b == 'boolean';
        },
      };
      Type.num = Type.num || {
        is: function (n) {
          DEP('num');
          return (
            !list_is(n) &&
            (n - parseFloat(n) + 1 >= 0 || Infinity === n || -Infinity === n)
          );
        },
      };
      Type.text = Type.text || {
        is: function (t) {
          DEP('text');
          return typeof t == 'string';
        },
      };
      Type.text.ify =
        Type.text.ify ||
        function (t) {
          DEP('text.ify');
          if (Type.text.is(t)) {
            return t;
          }
          if (typeof JSON !== 'undefined') {
            return JSON.stringify(t);
          }
          return t && t.toString ? t.toString() : t;
        };
      Type.text.random =
        Type.text.random ||
        function (l, c) {
          DEP('text.random');
          var s = '';
          l = l || 24; // you are not going to make a 0 length random number, so no need to check type
          c =
            c ||
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
          while (l > 0) {
            s += c.charAt(Math.floor(Math.random() * c.length));
            l--;
          }
          return s;
        };
      Type.text.match =
        Type.text.match ||
        function (t, o) {
          var tmp, u;
          DEP('text.match');
          if ('string' !== typeof t) {
            return false;
          }
          if ('string' == typeof o) {
            o = { '=': o };
          }
          o = o || {};
          tmp = o['='] || o['*'] || o['>'] || o['<'];
          if (t === tmp) {
            return true;
          }
          if (u !== o['=']) {
            return false;
          }
          tmp = o['*'] || o['>'] || o['<'];
          if (t.slice(0, (tmp || '').length) === tmp) {
            return true;
          }
          if (u !== o['*']) {
            return false;
          }
          if (u !== o['>'] && u !== o['<']) {
            return t >= o['>'] && t <= o['<'] ? true : false;
          }
          if (u !== o['>'] && t >= o['>']) {
            return true;
          }
          if (u !== o['<'] && t <= o['<']) {
            return true;
          }
          return false;
        };
      Type.text.hash =
        Type.text.hash ||
        function (s, c) {
          // via SO
          DEP('text.hash');
          if (typeof s !== 'string') {
            return;
          }
          c = c || 0;
          if (!s.length) {
            return c;
          }
          for (var i = 0, l = s.length, n; i < l; ++i) {
            n = s.charCodeAt(i);
            c = (c << 5) - c + n;
            c |= 0;
          }
          return c;
        };
      Type.list = Type.list || {
        is: function (l) {
          DEP('list');
          return l instanceof Array;
        },
      };
      Type.list.slit = Type.list.slit || Array.prototype.slice;
      Type.list.sort =
        Type.list.sort ||
        function (k) {
          // creates a new sort function based off some key
          DEP('list.sort');
          return function (A, B) {
            if (!A || !B) {
              return 0;
            }
            A = A[k];
            B = B[k];
            if (A < B) {
              return -1;
            } else if (A > B) {
              return 1;
            } else {
              return 0;
            }
          };
        };
      Type.list.map =
        Type.list.map ||
        function (l, c, _) {
          DEP('list.map');
          return obj_map(l, c, _);
        };
      Type.list.index = 1; // change this to 0 if you want non-logical, non-mathematical, non-matrix, non-convenient array notation
      Type.obj = Type.boj || {
        is: function (o) {
          DEP('obj');
          return o
            ? (o instanceof Object && o.constructor === Object) ||
                Object.prototype.toString
                  .call(o)
                  .match(/^\[object (\w+)\]$/)[1] === 'Object'
            : false;
        },
      };
      Type.obj.put =
        Type.obj.put ||
        function (o, k, v) {
          DEP('obj.put');
          return ((o || {})[k] = v), o;
        };
      Type.obj.has =
        Type.obj.has ||
        function (o, k) {
          DEP('obj.has');
          return o && Object.prototype.hasOwnProperty.call(o, k);
        };
      Type.obj.del =
        Type.obj.del ||
        function (o, k) {
          DEP('obj.del');
          if (!o) {
            return;
          }
          o[k] = null;
          delete o[k];
          return o;
        };
      Type.obj.as =
        Type.obj.as ||
        function (o, k, v, u) {
          DEP('obj.as');
          return (o[k] = o[k] || (u === v ? {} : v));
        };
      Type.obj.ify =
        Type.obj.ify ||
        function (o) {
          DEP('obj.ify');
          if (obj_is(o)) {
            return o;
          }
          try {
            o = JSON.parse(o);
          } catch (e) {
            o = {};
          }
          return o;
        };
      (function () {
        var u;
        function map(v, k) {
          if (obj_has(this, k) && u !== this[k]) {
            return;
          }
          this[k] = v;
        }
        Type.obj.to =
          Type.obj.to ||
          function (from, to) {
            DEP('obj.to');
            to = to || {};
            obj_map(from, map, to);
            return to;
          };
      })();
      Type.obj.copy =
        Type.obj.copy ||
        function (o) {
          DEP('obj.copy'); // because http://web.archive.org/web/20140328224025/http://jsperf.com/cloning-an-object/2
          return !o ? o : JSON.parse(JSON.stringify(o)); // is shockingly faster than anything else, and our data has to be a subset of JSON anyways!
        };
      (function () {
        function empty(v, i) {
          var n = this.n,
            u;
          if (n && (i === n || (obj_is(n) && obj_has(n, i)))) {
            return;
          }
          if (u !== i) {
            return true;
          }
        }
        Type.obj.empty =
          Type.obj.empty ||
          function (o, n) {
            DEP('obj.empty');
            if (!o) {
              return true;
            }
            return obj_map(o, empty, { n: n }) ? false : true;
          };
      })();
      (function () {
        function t(k, v) {
          if (2 === arguments.length) {
            t.r = t.r || {};
            t.r[k] = v;
            return;
          }
          t.r = t.r || [];
          t.r.push(k);
        }
        var keys = Object.keys,
          map;
        Object.keys =
          Object.keys ||
          function (o) {
            return map(o, function (v, k, t) {
              t(k);
            });
          };
        Type.obj.map = map =
          Type.obj.map ||
          function (l, c, _) {
            DEP('obj.map');
            var u,
              i = 0,
              x,
              r,
              ll,
              lle,
              f = 'function' == typeof c;
            t.r = u;
            if (keys && obj_is(l)) {
              ll = keys(l);
              lle = true;
            }
            _ = _ || {};
            if (list_is(l) || ll) {
              x = (ll || l).length;
              for (; i < x; i++) {
                var ii = i + Type.list.index;
                if (f) {
                  r = lle
                    ? c.call(_, l[ll[i]], ll[i], t)
                    : c.call(_, l[i], ii, t);
                  if (r !== u) {
                    return r;
                  }
                } else {
                  //if(Type.test.is(c,l[i])){ return ii } // should implement deep equality testing!
                  if (c === l[lle ? ll[i] : i]) {
                    return ll ? ll[i] : ii;
                  } // use this for now
                }
              }
            } else {
              for (i in l) {
                if (f) {
                  if (obj_has(l, i)) {
                    r = _ ? c.call(_, l[i], i, t) : c(l[i], i, t);
                    if (r !== u) {
                      return r;
                    }
                  }
                } else {
                  //if(a.test.is(c,l[i])){ return i } // should implement deep equality testing!
                  if (c === l[i]) {
                    return i;
                  } // use this for now
                }
              }
            }
            return f ? t.r : Type.list.index ? 0 : -1;
          };
      })();
      Type.time = Type.time || {};
      Type.time.is =
        Type.time.is ||
        function (t) {
          DEP('time');
          return t ? t instanceof Date : +new Date().getTime();
        };

      var fn_is = Type.fn.is;
      var list_is = Type.list.is;
      var obj = Type.obj,
        obj_is = obj.is,
        obj_has = obj.has,
        obj_map = obj.map;

      var Val = {};
      Val.is = function (v) {
        DEP('val.is'); // Valid values are a subset of JSON: null, binary, number (!Infinity), text, or a soul relation. Arrays need special algorithms to handle concurrency, so they are not supported directly. Use an extension that supports them if needed but research their problems first.
        if (v === u) {
          return false;
        }
        if (v === null) {
          return true;
        } // "deletes", nulling out keys.
        if (v === Infinity) {
          return false;
        } // we want this to be, but JSON does not support it, sad face.
        if (
          text_is(v) || // by "text" we mean strings.
          bi_is(v) || // by "binary" we mean boolean.
          num_is(v)
        ) {
          // by "number" we mean integers or decimals.
          return true; // simple values are valid.
        }
        return Val.link.is(v) || false; // is the value a soul relation? Then it is valid and return it. If not, everything else remaining is an invalid data type. Custom extensions can be built on top of these primitives to support other types.
      };
      Val.link = Val.rel = { _: '#' };
      (function () {
        Val.link.is = function (v) {
          DEP('val.link.is'); // this defines whether an object is a soul relation or not, they look like this: {'#': 'UUID'}
          if (v && v[rel_] && !v._ && obj_is(v)) {
            // must be an object.
            var o = {};
            obj_map(v, map, o);
            if (o.id) {
              // a valid id was found.
              return o.id; // yay! Return it.
            }
          }
          return false; // the value was not a valid soul relation.
        };
        function map(s, k) {
          var o = this; // map over the object...
          if (o.id) {
            return (o.id = false);
          } // if ID is already defined AND we're still looping through the object, it is considered invalid.
          if (k == rel_ && text_is(s)) {
            // the key should be '#' and have a text value.
            o.id = s; // we found the soul!
          } else {
            return (o.id = false); // if there exists anything else on the object that isn't the soul, then it is considered invalid.
          }
        }
      })();
      Val.link.ify = function (t) {
        DEP('val.link.ify');
        return obj_put({}, rel_, t);
      }; // convert a soul into a relation and return it.
      Type.obj.has._ = '.';
      var rel_ = Val.link._,
        u;
      var bi_is = Type.bi.is;
      var num_is = Type.num.is;
      var text_is = Type.text.is;
      var obj = Type.obj,
        obj_is = obj.is,
        obj_put = obj.put,
        obj_map = obj.map;

      Type.val = Type.val || Val;

      var Node = { _: '_' };
      Node.soul = function (n, o) {
        DEP('node.soul');
        return n && n._ && n._[o || soul_];
      }; // convenience function to check to see if there is a soul on a node and return it.
      Node.soul.ify = function (n, o) {
        DEP('node.soul.ify'); // put a soul on an object.
        o = typeof o === 'string' ? { soul: o } : o || {};
        n = n || {}; // make sure it exists.
        n._ = n._ || {}; // make sure meta exists.
        n._[soul_] = o.soul || n._[soul_] || text_random(); // put the soul on it.
        return n;
      };
      Node.soul._ = Val.link._;
      (function () {
        Node.is = function (n, cb, as) {
          DEP('node.is');
          var s; // checks to see if an object is a valid node.
          if (!obj_is(n)) {
            return false;
          } // must be an object.
          if ((s = Node.soul(n))) {
            // must have a soul on it.
            return !obj_map(n, map, { as: as, cb: cb, s: s, n: n });
          }
          return false; // nope! This was not a valid node.
        };
        function map(v, k) {
          // we invert this because the way we check for this is via a negation.
          if (k === Node._) {
            return;
          } // skip over the metadata.
          if (!Val.is(v)) {
            return true;
          } // it is true that this is an invalid node.
          if (this.cb) {
            this.cb.call(this.as, v, k, this.n, this.s);
          } // optionally callback each key/value.
        }
      })();
      (function () {
        Node.ify = function (obj, o, as) {
          DEP('node.ify'); // returns a node from a shallow object.
          if (!o) {
            o = {};
          } else if (typeof o === 'string') {
            o = { soul: o };
          } else if ('function' == typeof o) {
            o = { map: o };
          }
          if (o.map) {
            o.node = o.map.call(as, obj, u, o.node || {});
          }
          if ((o.node = Node.soul.ify(o.node || {}, o))) {
            obj_map(obj, map, { o: o, as: as });
          }
          return o.node; // This will only be a valid node if the object wasn't already deep!
        };
        function map(v, k) {
          var o = this.o,
            tmp,
            u; // iterate over each key/value.
          if (o.map) {
            tmp = o.map.call(this.as, v, '' + k, o.node);
            if (u === tmp) {
              obj_del(o.node, k);
            } else if (o.node) {
              o.node[k] = tmp;
            }
            return;
          }
          if (Val.is(v)) {
            o.node[k] = v;
          }
        }
      })();
      var obj = Type.obj,
        obj_is = obj.is,
        obj_del = obj.del,
        obj_map = obj.map;
      var text = Type.text,
        text_random = text.random;
      var soul_ = Node.soul._;
      var u;
      Type.node = Type.node || Node;

      var State = Type.state;
      State.lex = function () {
        DEP('state.lex');
        return State().toString(36).replace('.', '');
      };
      State.to = function (from, k, to) {
        DEP('state.to');
        var val = (from || {})[k];
        if (obj_is(val)) {
          val = obj_copy(val);
        }
        return State.ify(to, k, State.is(from, k), val, Node.soul(from));
      };
      (function () {
        State.map = function (cb, s, as) {
          DEP('state.map');
          var u; // for use with Node.ify
          var o = obj_is((o = cb || s)) ? o : null;
          cb = fn_is((cb = cb || s)) ? cb : null;
          if (o && !cb) {
            s = num_is(s) ? s : State();
            o[N_] = o[N_] || {};
            obj_map(o, map, { o: o, s: s });
            return o;
          }
          as = as || obj_is(s) ? s : u;
          s = num_is(s) ? s : State();
          return function (v, k, o, opt) {
            if (!cb) {
              map.call({ o: o, s: s }, v, k);
              return v;
            }
            cb.call(as || this || {}, v, k, o, opt);
            if (obj_has(o, k) && u === o[k]) {
              return;
            }
            map.call({ o: o, s: s }, v, k);
          };
        };
        function map(v, k) {
          if (N_ === k) {
            return;
          }
          State.ify(this.o, k, this.s);
        }
      })();
      var obj = Type.obj;
      obj.as;
      var obj_has = obj.has,
        obj_is = obj.is,
        obj_map = obj.map,
        obj_copy = obj.copy;
      var num = Type.num,
        num_is = num.is;
      var fn = Type.fn,
        fn_is = fn.is;
      var N_ = Node._,
        u;

      var Graph = {};
      (function () {
        Graph.is = function (g, cb, fn, as) {
          DEP('graph.is'); // checks to see if an object is a valid graph.
          if (!g || !obj_is(g) || obj_empty(g)) {
            return false;
          } // must be an object.
          return !obj_map(g, map, { cb: cb, fn: fn, as: as }); // makes sure it wasn't an empty object.
        };
        function map(n, s) {
          // we invert this because the way'? we check for this is via a negation.
          if (!n || s !== Node.soul(n) || !Node.is(n, this.fn, this.as)) {
            return true;
          } // it is true that this is an invalid graph.
          if (!this.cb) {
            return;
          }
          nf.n = n;
          nf.as = this.as; // sequential race conditions aren't races.
          this.cb.call(nf.as, n, s, nf);
        }
        function nf(fn) {
          // optional callback for each node.
          if (fn) {
            Node.is(nf.n, fn, nf.as);
          } // where we then have an optional callback for each key/value.
        }
      })();
      (function () {
        Graph.ify = function (obj, env, as) {
          DEP('graph.ify');
          var at = { path: [], obj: obj };
          if (!env) {
            env = {};
          } else if (typeof env === 'string') {
            env = { soul: env };
          } else if ('function' == typeof env) {
            env.map = env;
          }
          if (typeof as === 'string') {
            env.soul = env.soul || as;
            as = u;
          }
          if (env.soul) {
            at.link = Val.link.ify(env.soul);
          }
          env.shell = (as || {}).shell;
          env.graph = env.graph || {};
          env.seen = env.seen || [];
          env.as = env.as || as;
          node(env, at);
          env.root = at.node;
          return env.graph;
        };
        function node(env, at) {
          var tmp;
          if ((tmp = seen(env, at))) {
            return tmp;
          }
          at.env = env;
          at.soul = soul;
          if (Node.ify(at.obj, map, at)) {
            at.link = at.link || Val.link.ify(Node.soul(at.node));
            if (at.obj !== env.shell) {
              env.graph[Val.link.is(at.link)] = at.node;
            }
          }
          return at;
        }
        function map(v, k, n) {
          var at = this,
            env = at.env,
            is,
            tmp;
          if (Node._ === k && obj_has(v, Val.link._)) {
            return n._; // TODO: Bug?
          }
          if (!(is = valid(v, k, n, at, env))) {
            return;
          }
          if (!k) {
            at.node = at.node || n || {};
            if (obj_has(v, Node._) && Node.soul(v)) {
              // ? for safety ?
              at.node._ = obj_copy(v._);
            }
            at.node = Node.soul.ify(at.node, Val.link.is(at.link));
            at.link = at.link || Val.link.ify(Node.soul(at.node));
          }
          if ((tmp = env.map)) {
            tmp.call(env.as || {}, v, k, n, at);
            if (obj_has(n, k)) {
              v = n[k];
              if (u === v) {
                obj_del(n, k);
                return;
              }
              if (!(is = valid(v, k, n, at, env))) {
                return;
              }
            }
          }
          if (!k) {
            return at.node;
          }
          if (true === is) {
            return v;
          }
          tmp = node(env, { obj: v, path: at.path.concat(k) });
          if (!tmp.node) {
            return;
          }
          return tmp.link; //{'#': Node.soul(tmp.node)};
        }
        function soul(id) {
          var at = this;
          var prev = Val.link.is(at.link),
            graph = at.env.graph;
          at.link = at.link || Val.link.ify(id);
          at.link[Val.link._] = id;
          if (at.node && at.node[Node._]) {
            at.node[Node._][Val.link._] = id;
          }
          if (obj_has(graph, prev)) {
            graph[id] = graph[prev];
            obj_del(graph, prev);
          }
        }
        function valid(v, k, n, at, env) {
          var tmp;
          if (Val.is(v)) {
            return true;
          }
          if (obj_is(v)) {
            return 1;
          }
          if ((tmp = env.invalid)) {
            v = tmp.call(env.as || {}, v, k, n);
            return valid(v, k, n, at, env);
          }
          env.err = "Invalid value at '" + at.path.concat(k).join('.') + "'!";
          if (Type.list.is(v)) {
            env.err += ' Use `.set(item)` instead of an Array.';
          }
        }
        function seen(env, at) {
          var arr = env.seen,
            i = arr.length,
            has;
          while (i--) {
            has = arr[i];
            if (at.obj === has.obj) {
              return has;
            }
          }
          arr.push(at);
        }
      })();
      Graph.node = function (node) {
        DEP('graph.node');
        var soul = Node.soul(node);
        if (!soul) {
          return;
        }
        return obj_put({}, soul, node);
      };
      (function () {
        Graph.to = function (graph, root, opt) {
          DEP('graph.to');
          if (!graph) {
            return;
          }
          var obj = {};
          opt = opt || { seen: {} };
          obj_map(graph[root], map, { obj: obj, graph: graph, opt: opt });
          return obj;
        };
        function map(v, k) {
          var tmp, obj;
          if (Node._ === k) {
            if (obj_empty(v, Val.link._)) {
              return;
            }
            this.obj[k] = obj_copy(v);
            return;
          }
          if (!(tmp = Val.link.is(v))) {
            this.obj[k] = v;
            return;
          }
          if ((obj = this.opt.seen[tmp])) {
            this.obj[k] = obj;
            return;
          }
          this.obj[k] = this.opt.seen[tmp] = Graph.to(
            this.graph,
            tmp,
            this.opt
          );
        }
      })();
      var fn_is = Type.fn.is;
      var obj = Type.obj,
        obj_is = obj.is,
        obj_del = obj.del,
        obj_has = obj.has,
        obj_empty = obj.empty,
        obj_put = obj.put,
        obj_map = obj.map,
        obj_copy = obj.copy;
      var u;
      Type.graph = Type.graph || Graph;
    })();
  })(gun$1);
  return gun$1.exports;
}

var gunExports = requireGun();
var Gun$1 = /*@__PURE__*/ getDefaultExportFromCjs(gunExports);

var sea = { exports: {} };

sea.exports;

var hasRequiredSea;

function requireSea() {
  if (hasRequiredSea) return sea.exports;
  hasRequiredSea = 1;
  (function (module) {
    (function () {
      /* UNBUILD */
      function USE(arg, req) {
        return req
          ? require(arg)
          : arg.slice
          ? USE[R(arg)]
          : function (mod, path) {
              arg((mod = { exports: {} }));
              USE[R(path)] = mod.exports;
            };
        function R(p) {
          return p.split('/').slice(-1).toString().replace('.js', '');
        }
      }
      {
        var MODULE = module;
      }
      USE(function (module) {
        // Security, Encryption, and Authorization: SEA.js
        // MANDATORY READING: https://gun.eco/explainers/data/security.html
        // IT IS IMPLEMENTED IN A POLYFILL/SHIM APPROACH.
        // THIS IS AN EARLY ALPHA!

        if (typeof self !== 'undefined') {
          module.window = self;
        } // should be safe for at least browser/worker/nodejs, need to check other envs like RN etc.
        if (typeof window !== 'undefined') {
          module.window = window;
        }

        var tmp = module.window || module,
          u;
        var SEA = tmp.SEA || {};

        if ((SEA.window = module.window)) {
          SEA.window.SEA = SEA;
        }

        try {
          if (u + '' !== typeof MODULE) {
            MODULE.exports = SEA;
          }
        } catch (e) {}
        module.exports = SEA;
      })(USE, './root');
      USE(function (module) {
        var SEA = USE('./root');
        try {
          if (SEA.window) {
            if (
              location.protocol.indexOf('s') < 0 &&
              location.host.indexOf('localhost') < 0 &&
              !/^127\.\d+\.\d+\.\d+$/.test(location.hostname) &&
              location.protocol.indexOf('file:') < 0
            ) {
              console.warn('HTTPS needed for WebCrypto in SEA, redirecting...');
              location.protocol = 'https:'; // WebCrypto does NOT work without HTTPS!
            }
          }
        } catch (e) {}
      })(USE, './https');
      USE(function (module) {
        var u;
        if (u + '' == typeof btoa) {
          if (u + '' == typeof Buffer) {
            try {
              commonjsGlobal.Buffer = USE('buffer', 1).Buffer;
            } catch (e) {
              console.log(
                'Please `npm install buffer` or add it to your package.json !'
              );
            }
          }
          commonjsGlobal.btoa = function (data) {
            return Buffer.from(data, 'binary').toString('base64');
          };
          commonjsGlobal.atob = function (data) {
            return Buffer.from(data, 'base64').toString('binary');
          };
        }
      })(USE, './base64');
      USE(function (module) {
        USE('./base64');
        // This is Array extended to have .toString(['utf8'|'hex'|'base64'])
        function SeaArray() {}
        Object.assign(SeaArray, { from: Array.from });
        SeaArray.prototype = Object.create(Array.prototype);
        SeaArray.prototype.toString = function (enc, start, end) {
          enc = enc || 'utf8';
          start = start || 0;
          const length = this.length;
          if (enc === 'hex') {
            const buf = new Uint8Array(this);
            return [...Array(((end && end + 1) || length) - start).keys()]
              .map((i) => buf[i + start].toString(16).padStart(2, '0'))
              .join('');
          }
          if (enc === 'utf8') {
            return Array.from({ length: (end || length) - start }, (_, i) =>
              String.fromCharCode(this[i + start])
            ).join('');
          }
          if (enc === 'base64') {
            return btoa(this);
          }
        };
        module.exports = SeaArray;
      })(USE, './array');
      USE(function (module) {
        USE('./base64');
        // This is Buffer implementation used in SEA. Functionality is mostly
        // compatible with NodeJS 'safe-buffer' and is used for encoding conversions
        // between binary and 'hex' | 'utf8' | 'base64'
        // See documentation and validation for safe implementation in:
        // https://github.com/feross/safe-buffer#update
        var SeaArray = USE('./array');
        function SafeBuffer(...props) {
          console.warn(
            'new SafeBuffer() is depreciated, please use SafeBuffer.from()'
          );
          return SafeBuffer.from(...props);
        }
        SafeBuffer.prototype = Object.create(Array.prototype);
        Object.assign(SafeBuffer, {
          // (data, enc) where typeof data === 'string' then enc === 'utf8'|'hex'|'base64'
          from() {
            if (!Object.keys(arguments).length || arguments[0] == null) {
              throw new TypeError(
                'First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.'
              );
            }
            const input = arguments[0];
            let buf;
            if (typeof input === 'string') {
              const enc = arguments[1] || 'utf8';
              if (enc === 'hex') {
                const bytes = input
                  .match(/([\da-fA-F]{2})/g)
                  .map((byte) => parseInt(byte, 16));
                if (!bytes || !bytes.length) {
                  throw new TypeError("Invalid first argument for type 'hex'.");
                }
                buf = SeaArray.from(bytes);
              } else if (enc === 'utf8' || 'binary' === enc) {
                // EDIT BY MARK: I think this is safe, tested it against a couple "binary" strings. This lets SafeBuffer match NodeJS Buffer behavior more where it safely btoas regular strings.
                const length = input.length;
                const words = new Uint16Array(length);
                Array.from(
                  { length: length },
                  (_, i) => (words[i] = input.charCodeAt(i))
                );
                buf = SeaArray.from(words);
              } else if (enc === 'base64') {
                const dec = atob(input);
                const length = dec.length;
                const bytes = new Uint8Array(length);
                Array.from(
                  { length: length },
                  (_, i) => (bytes[i] = dec.charCodeAt(i))
                );
                buf = SeaArray.from(bytes);
              } else if (enc === 'binary') {
                // deprecated by above comment
                buf = SeaArray.from(input); // some btoas were mishandled.
              } else {
                console.info('SafeBuffer.from unknown encoding: ' + enc);
              }
              return buf;
            }
            input.byteLength; // what is going on here? FOR MARTTI
            const length = input.byteLength ? input.byteLength : input.length;
            if (length) {
              let buf;
              if (input instanceof ArrayBuffer) {
                buf = new Uint8Array(input);
              }
              return SeaArray.from(buf || input);
            }
          },
          // This is 'safe-buffer.alloc' sans encoding support
          alloc(length, fill = 0 /*, enc*/) {
            return SeaArray.from(
              new Uint8Array(Array.from({ length: length }, () => fill))
            );
          },
          // This is normal UNSAFE 'buffer.alloc' or 'new Buffer(length)' - don't use!
          allocUnsafe(length) {
            return SeaArray.from(
              new Uint8Array(Array.from({ length: length }))
            );
          },
          // This puts together array of array like members
          concat(arr) {
            // octet array
            if (!Array.isArray(arr)) {
              throw new TypeError(
                'First argument must be Array containing ArrayBuffer or Uint8Array instances.'
              );
            }
            return SeaArray.from(
              arr.reduce((ret, item) => ret.concat(Array.from(item)), [])
            );
          },
        });
        SafeBuffer.prototype.from = SafeBuffer.from;
        SafeBuffer.prototype.toString = SeaArray.prototype.toString;

        module.exports = SafeBuffer;
      })(USE, './buffer');
      USE(function (module) {
        const SEA = USE('./root');
        const api = { Buffer: USE('./buffer') };
        var o = {},
          u;

        // ideally we can move away from JSON entirely? unlikely due to compatibility issues... oh well.
        JSON.parseAsync =
          JSON.parseAsync ||
          function (t, cb, r) {
            var u;
            try {
              cb(u, JSON.parse(t, r));
            } catch (e) {
              cb(e);
            }
          };
        JSON.stringifyAsync =
          JSON.stringifyAsync ||
          function (v, cb, r, s) {
            var u;
            try {
              cb(u, JSON.stringify(v, r, s));
            } catch (e) {
              cb(e);
            }
          };

        api.parse = function (t, r) {
          return new Promise(function (res, rej) {
            JSON.parseAsync(
              t,
              function (err, raw) {
                err ? rej(err) : res(raw);
              },
              r
            );
          });
        };
        api.stringify = function (v, r, s) {
          return new Promise(function (res, rej) {
            JSON.stringifyAsync(
              v,
              function (err, raw) {
                err ? rej(err) : res(raw);
              },
              r,
              s
            );
          });
        };

        if (SEA.window) {
          api.crypto = SEA.window.crypto || SEA.window.msCrypto;
          api.subtle =
            (api.crypto || o).subtle || (api.crypto || o).webkitSubtle;
          api.TextEncoder = SEA.window.TextEncoder;
          api.TextDecoder = SEA.window.TextDecoder;
          api.random = (len) =>
            api.Buffer.from(
              api.crypto.getRandomValues(new Uint8Array(api.Buffer.alloc(len)))
            );
        }
        if (!api.TextDecoder) {
          const { TextEncoder, TextDecoder } = USE(
            (u + '' == typeof MODULE ? '.' : '') + './lib/text-encoding',
            1
          );
          api.TextDecoder = TextDecoder;
          api.TextEncoder = TextEncoder;
        }
        if (!api.crypto) {
          try {
            var crypto = USE('crypto', 1);
            Object.assign(api, {
              crypto,
              random: (len) => api.Buffer.from(crypto.randomBytes(len)),
            });
            const { Crypto: WebCrypto } = USE('@peculiar/webcrypto', 1);
            api.ossl = api.subtle = new WebCrypto({ directory: 'ossl' }).subtle; // ECDH
          } catch (e) {
            console.log(
              'Please `npm install @peculiar/webcrypto` or add it to your package.json !'
            );
          }
        }

        module.exports = api;
      })(USE, './shim');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        var s = {};
        s.pbkdf2 = { hash: { name: 'SHA-256' }, iter: 100000, ks: 64 };
        s.ecdsa = {
          pair: { name: 'ECDSA', namedCurve: 'P-256' },
          sign: { name: 'ECDSA', hash: { name: 'SHA-256' } },
        };
        s.ecdh = { name: 'ECDH', namedCurve: 'P-256' };

        // This creates Web Cryptography API compliant JWK for sign/verify purposes
        s.jwk = function (pub, d) {
          // d === priv
          pub = pub.split('.');
          var x = pub[0],
            y = pub[1];
          var jwk = { kty: 'EC', crv: 'P-256', x: x, y: y, ext: true };
          jwk.key_ops = d ? ['sign'] : ['verify'];
          if (d) {
            jwk.d = d;
          }
          return jwk;
        };

        s.keyToJwk = function (keyBytes) {
          const keyB64 = keyBytes.toString('base64');
          const k = keyB64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/\=/g, '');
          return { kty: 'oct', k: k, ext: false, alg: 'A256GCM' };
        };

        s.recall = {
          validity: 12 * 60 * 60, // internally in seconds : 12 hours
          hook: function (props) {
            return props;
          }, // { iat, exp, alias, remember } // or return new Promise((resolve, reject) => resolve(props)
        };

        s.check = function (t) {
          return typeof t == 'string' && 'SEA{' === t.slice(0, 4);
        };
        s.parse = async function p(t) {
          try {
            var yes = typeof t == 'string';
            if (yes && 'SEA{' === t.slice(0, 4)) {
              t = t.slice(3);
            }
            return yes ? await shim.parse(t) : t;
          } catch (e) {}
          return t;
        };

        SEA.opt = s;
        module.exports = s;
      })(USE, './settings');
      USE(function (module) {
        var shim = USE('./shim');
        module.exports = async function (d, o) {
          var t = typeof d == 'string' ? d : await shim.stringify(d);
          var hash = await shim.subtle.digest(
            { name: o || 'SHA-256' },
            new shim.TextEncoder().encode(t)
          );
          return shim.Buffer.from(hash);
        };
      })(USE, './sha256');
      USE(function (module) {
        // This internal func returns SHA-1 hashed data for KeyID generation
        const __shim = USE('./shim');
        const subtle = __shim.subtle;
        const ossl = __shim.ossl ? __shim.ossl : subtle;
        const sha1hash = (b) =>
          ossl.digest({ name: 'SHA-1' }, new ArrayBuffer(b));
        module.exports = sha1hash;
      })(USE, './sha1');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        var S = USE('./settings');
        var sha = USE('./sha256');
        var u;

        SEA.work =
          SEA.work ||
          (async (data, pair, cb, opt) => {
            try {
              // used to be named `proof`
              var salt = (pair || {}).epub || pair; // epub not recommended, salt should be random!
              opt = opt || {};
              if (salt instanceof Function) {
                cb = salt;
                salt = u;
              }
              data =
                typeof data == 'string' ? data : await shim.stringify(data);
              if ('sha' === (opt.name || '').toLowerCase().slice(0, 3)) {
                var rsha = shim.Buffer.from(
                  await sha(data, opt.name),
                  'binary'
                ).toString(opt.encode || 'base64');
                if (cb) {
                  try {
                    cb(rsha);
                  } catch (e) {
                    console.log(e);
                  }
                }
                return rsha;
              }
              salt = salt || shim.random(9);
              var key = await (shim.ossl || shim.subtle).importKey(
                'raw',
                new shim.TextEncoder().encode(data),
                { name: opt.name || 'PBKDF2' },
                false,
                ['deriveBits']
              );
              var work = await (shim.ossl || shim.subtle).deriveBits(
                {
                  name: opt.name || 'PBKDF2',
                  iterations: opt.iterations || S.pbkdf2.iter,
                  salt: new shim.TextEncoder().encode(opt.salt || salt),
                  hash: opt.hash || S.pbkdf2.hash,
                },
                key,
                opt.length || S.pbkdf2.ks * 8
              );
              data = shim.random(data.length); // Erase data in case of passphrase
              var r = shim.Buffer.from(work, 'binary').toString(
                opt.encode || 'base64'
              );
              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.work;
      })(USE, './work');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        USE('./settings');

        SEA.name =
          SEA.name ||
          (async (cb, opt) => {
            try {
              if (cb) {
                try {
                  cb();
                } catch (e) {
                  console.log(e);
                }
              }
              return;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        //SEA.pair = async (data, proof, cb) => { try {
        SEA.pair =
          SEA.pair ||
          (async (cb, opt) => {
            try {
              var ecdhSubtle = shim.ossl || shim.subtle;
              // First: ECDSA keys for signing/verifying...
              var sa = await shim.subtle
                .generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
                  'sign',
                  'verify',
                ])
                .then(async (keys) => {
                  // privateKey scope doesn't leak out from here!
                  //const { d: priv } = await shim.subtle.exportKey('jwk', keys.privateKey)
                  var key = {};
                  key.priv = (
                    await shim.subtle.exportKey('jwk', keys.privateKey)
                  ).d;
                  var pub = await shim.subtle.exportKey('jwk', keys.publicKey);
                  //const pub = Buff.from([ x, y ].join(':')).toString('base64') // old
                  key.pub = pub.x + '.' + pub.y; // new
                  // x and y are already base64
                  // pub is UTF8 but filename/URL safe (https://www.ietf.org/rfc/rfc3986.txt)
                  // but split on a non-base64 letter.
                  return key;
                });

              // To include PGPv4 kind of keyId:
              // const pubId = await SEA.keyid(keys.pub)
              // Next: ECDH keys for encryption/decryption...

              try {
                var dh = await ecdhSubtle
                  .generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
                    'deriveKey',
                  ])
                  .then(async (keys) => {
                    // privateKey scope doesn't leak out from here!
                    var key = {};
                    key.epriv = (
                      await ecdhSubtle.exportKey('jwk', keys.privateKey)
                    ).d;
                    var pub = await ecdhSubtle.exportKey('jwk', keys.publicKey);
                    //const epub = Buff.from([ ex, ey ].join(':')).toString('base64') // old
                    key.epub = pub.x + '.' + pub.y; // new
                    // ex and ey are already base64
                    // epub is UTF8 but filename/URL safe (https://www.ietf.org/rfc/rfc3986.txt)
                    // but split on a non-base64 letter.
                    return key;
                  });
              } catch (e) {
                if (SEA.window) {
                  throw e;
                }
                if (e == 'Error: ECDH is not a supported algorithm') {
                  console.log('Ignoring ECDH...');
                } else {
                  throw e;
                }
              }
              dh = dh || {};

              var r = {
                pub: sa.pub,
                priv: sa.priv,
                /* pubId, */ epub: dh.epub,
                epriv: dh.epriv,
              };
              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.pair;
      })(USE, './pair');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        var S = USE('./settings');
        var sha = USE('./sha256');
        var u;

        SEA.sign =
          SEA.sign ||
          (async (data, pair, cb, opt) => {
            try {
              opt = opt || {};
              if (!(pair || opt).priv) {
                if (!SEA.I) {
                  throw 'No signing key.';
                }
                pair = await SEA.I(null, {
                  what: data,
                  how: 'sign',
                  why: opt.why,
                });
              }
              if (u === data) {
                throw '`undefined` not allowed.';
              }
              var json = await S.parse(data);
              var check = (opt.check = opt.check || json);
              if (
                SEA.verify &&
                (SEA.opt.check(check) || (check && check.s && check.m)) &&
                u !== (await SEA.verify(check, pair))
              ) {
                // don't sign if we already signed it.
                var r = await S.parse(check);
                if (!opt.raw) {
                  r = 'SEA' + (await shim.stringify(r));
                }
                if (cb) {
                  try {
                    cb(r);
                  } catch (e) {
                    console.log(e);
                  }
                }
                return r;
              }
              var pub = pair.pub;
              var priv = pair.priv;
              var jwk = S.jwk(pub, priv);
              var hash = await sha(json);
              var sig = await (shim.ossl || shim.subtle)
                .importKey(
                  'jwk',
                  jwk,
                  { name: 'ECDSA', namedCurve: 'P-256' },
                  false,
                  ['sign']
                )
                .then((key) =>
                  (shim.ossl || shim.subtle).sign(
                    { name: 'ECDSA', hash: { name: 'SHA-256' } },
                    key,
                    new Uint8Array(hash)
                  )
                ); // privateKey scope doesn't leak out from here!
              var r = {
                m: json,
                s: shim.Buffer.from(sig, 'binary').toString(
                  opt.encode || 'base64'
                ),
              };
              if (!opt.raw) {
                r = 'SEA' + (await shim.stringify(r));
              }

              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.sign;
      })(USE, './sign');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        var S = USE('./settings');
        var sha = USE('./sha256');
        var u;

        SEA.verify =
          SEA.verify ||
          (async (data, pair, cb, opt) => {
            try {
              var json = await S.parse(data);
              if (false === pair) {
                // don't verify!
                var raw = await S.parse(json.m);
                if (cb) {
                  try {
                    cb(raw);
                  } catch (e) {
                    console.log(e);
                  }
                }
                return raw;
              }
              opt = opt || {};
              // SEA.I // verify is free! Requires no user permission.
              var pub = pair.pub || pair;
              var key = SEA.opt.slow_leak
                ? await SEA.opt.slow_leak(pub)
                : await (shim.ossl || shim.subtle).importKey(
                    'jwk',
                    S.jwk(pub),
                    { name: 'ECDSA', namedCurve: 'P-256' },
                    false,
                    ['verify']
                  );
              var hash = await sha(json.m);
              var buf, sig, check, tmp;
              try {
                buf = shim.Buffer.from(json.s, opt.encode || 'base64'); // NEW DEFAULT!
                sig = new Uint8Array(buf);
                check = await (shim.ossl || shim.subtle).verify(
                  { name: 'ECDSA', hash: { name: 'SHA-256' } },
                  key,
                  sig,
                  new Uint8Array(hash)
                );
                if (!check) {
                  throw 'Signature did not match.';
                }
              } catch (e) {
                if (SEA.opt.fallback) {
                  return await SEA.opt.fall_verify(data, pair, cb, opt);
                }
              }
              var r = check ? await S.parse(json.m) : u;

              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e); // mismatched owner FOR MARTTI
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.verify;
        // legacy & ossl memory leak mitigation:

        var knownKeys = {};
        SEA.opt.slow_leak = (pair) => {
          if (knownKeys[pair]) return knownKeys[pair];
          var jwk = S.jwk(pair);
          knownKeys[pair] = (shim.ossl || shim.subtle).importKey(
            'jwk',
            jwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
          );
          return knownKeys[pair];
        };

        var O = SEA.opt;
        SEA.opt.fall_verify = async function (data, pair, cb, opt, f) {
          if (f === SEA.opt.fallback) {
            throw 'Signature did not match';
          }
          f = f || 1;
          var tmp = data || '';
          data = SEA.opt.unpack(data) || data;
          var json = await S.parse(data),
            pub = pair.pub || pair,
            key = await SEA.opt.slow_leak(pub);
          var hash =
            f <= SEA.opt.fallback
              ? shim.Buffer.from(
                  await shim.subtle.digest(
                    { name: 'SHA-256' },
                    new shim.TextEncoder().encode(await S.parse(json.m))
                  )
                )
              : await sha(json.m); // this line is old bad buggy code but necessary for old compatibility.
          var buf;
          var sig;
          var check;
          try {
            buf = shim.Buffer.from(json.s, opt.encode || 'base64'); // NEW DEFAULT!
            sig = new Uint8Array(buf);
            check = await (shim.ossl || shim.subtle).verify(
              { name: 'ECDSA', hash: { name: 'SHA-256' } },
              key,
              sig,
              new Uint8Array(hash)
            );
            if (!check) {
              throw 'Signature did not match.';
            }
          } catch (e) {
            try {
              buf = shim.Buffer.from(json.s, 'utf8'); // AUTO BACKWARD OLD UTF8 DATA!
              sig = new Uint8Array(buf);
              check = await (shim.ossl || shim.subtle).verify(
                { name: 'ECDSA', hash: { name: 'SHA-256' } },
                key,
                sig,
                new Uint8Array(hash)
              );
            } catch (e) {
              if (!check) {
                throw 'Signature did not match.';
              }
            }
          }
          var r = check ? await S.parse(json.m) : u;
          O.fall_soul = tmp['#'];
          O.fall_key = tmp['.'];
          O.fall_val = data;
          O.fall_state = tmp['>'];
          if (cb) {
            try {
              cb(r);
            } catch (e) {
              console.log(e);
            }
          }
          return r;
        };
        SEA.opt.fallback = 2;
      })(USE, './verify');
      USE(function (module) {
        var shim = USE('./shim');
        var S = USE('./settings');
        var sha256hash = USE('./sha256');

        const importGen = async (key, salt, opt) => {
          const combo = key + (salt || shim.random(8)).toString('utf8'); // new
          const hash = shim.Buffer.from(await sha256hash(combo), 'binary');

          const jwkKey = S.keyToJwk(hash);
          return await shim.subtle.importKey(
            'jwk',
            jwkKey,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
          );
        };
        module.exports = importGen;
      })(USE, './aeskey');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        USE('./settings');
        var aeskey = USE('./aeskey');
        var u;

        SEA.encrypt =
          SEA.encrypt ||
          (async (data, pair, cb, opt) => {
            try {
              opt = opt || {};
              var key = (pair || opt).epriv || pair;
              if (u === data) {
                throw '`undefined` not allowed.';
              }
              if (!key) {
                if (!SEA.I) {
                  throw 'No encryption key.';
                }
                pair = await SEA.I(null, {
                  what: data,
                  how: 'encrypt',
                  why: opt.why,
                });
                key = pair.epriv || pair;
              }
              var msg =
                typeof data == 'string' ? data : await shim.stringify(data);
              var rand = { s: shim.random(9), iv: shim.random(15) }; // consider making this 9 and 15 or 18 or 12 to reduce == padding.
              var ct = await aeskey(key, rand.s, opt).then((aes) =>
                shim/*shim.ossl ||*/ .subtle
                  .encrypt(
                    {
                      // Keeping the AES key scope as private as possible...
                      name: opt.name || 'AES-GCM',
                      iv: new Uint8Array(rand.iv),
                    },
                    aes,
                    new shim.TextEncoder().encode(msg)
                  )
              );
              var r = {
                ct: shim.Buffer.from(ct, 'binary').toString(
                  opt.encode || 'base64'
                ),
                iv: rand.iv.toString(opt.encode || 'base64'),
                s: rand.s.toString(opt.encode || 'base64'),
              };
              if (!opt.raw) {
                r = 'SEA' + (await shim.stringify(r));
              }

              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.encrypt;
      })(USE, './encrypt');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        var S = USE('./settings');
        var aeskey = USE('./aeskey');

        SEA.decrypt =
          SEA.decrypt ||
          (async (data, pair, cb, opt) => {
            try {
              opt = opt || {};
              var key = (pair || opt).epriv || pair;
              if (!key) {
                if (!SEA.I) {
                  throw 'No decryption key.';
                }
                pair = await SEA.I(null, {
                  what: data,
                  how: 'decrypt',
                  why: opt.why,
                });
                key = pair.epriv || pair;
              }
              var json = await S.parse(data);
              var buf, bufiv, bufct;
              try {
                buf = shim.Buffer.from(json.s, opt.encode || 'base64');
                bufiv = shim.Buffer.from(json.iv, opt.encode || 'base64');
                bufct = shim.Buffer.from(json.ct, opt.encode || 'base64');
                var ct = await aeskey(key, buf, opt).then((aes) =>
                  shim/*shim.ossl ||*/ .subtle
                    .decrypt(
                      {
                        // Keeping aesKey scope as private as possible...
                        name: opt.name || 'AES-GCM',
                        iv: new Uint8Array(bufiv),
                        tagLength: 128,
                      },
                      aes,
                      new Uint8Array(bufct)
                    )
                );
              } catch (e) {
                if ('utf8' === opt.encode) {
                  throw 'Could not decrypt';
                }
                if (SEA.opt.fallback) {
                  opt.encode = 'utf8';
                  return await SEA.decrypt(data, pair, cb, opt);
                }
              }
              var r = await S.parse(new shim.TextDecoder('utf8').decode(ct));
              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.decrypt;
      })(USE, './decrypt');
      USE(function (module) {
        var SEA = USE('./root');
        var shim = USE('./shim');
        USE('./settings');
        // Derive shared secret from other's pub and my epub/epriv
        SEA.secret =
          SEA.secret ||
          (async (key, pair, cb, opt) => {
            try {
              opt = opt || {};
              if (!pair || !pair.epriv || !pair.epub) {
                if (!SEA.I) {
                  throw 'No secret mix.';
                }
                pair = await SEA.I(null, {
                  what: key,
                  how: 'secret',
                  why: opt.why,
                });
              }
              var pub = key.epub || key;
              var epub = pair.epub;
              var epriv = pair.epriv;
              var ecdhSubtle = shim.ossl || shim.subtle;
              var pubKeyData = keysToEcdhJwk(pub);
              var props = Object.assign(
                { public: await ecdhSubtle.importKey(...pubKeyData, true, []) },
                { name: 'ECDH', namedCurve: 'P-256' }
              ); // Thanks to @sirpy !
              var privKeyData = keysToEcdhJwk(epub, epriv);
              var derived = await ecdhSubtle
                .importKey(...privKeyData, false, ['deriveBits'])
                .then(async (privKey) => {
                  // privateKey scope doesn't leak out from here!
                  var derivedBits = await ecdhSubtle.deriveBits(
                    props,
                    privKey,
                    256
                  );
                  var rawBits = new Uint8Array(derivedBits);
                  var derivedKey = await ecdhSubtle.importKey(
                    'raw',
                    rawBits,
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                  );
                  return ecdhSubtle
                    .exportKey('jwk', derivedKey)
                    .then(({ k }) => k);
                });
              var r = derived;
              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              console.log(e);
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        // can this be replaced with settings.jwk?
        var keysToEcdhJwk = (pub, d) => {
          // d === priv
          //var [ x, y ] = shim.Buffer.from(pub, 'base64').toString('utf8').split(':') // old
          var [x, y] = pub.split('.'); // new
          var jwk = d ? { d: d } : {};
          return [
            // Use with spread returned value...
            'jwk',
            Object.assign(jwk, {
              x: x,
              y: y,
              kty: 'EC',
              crv: 'P-256',
              ext: true,
            }), // ??? refactor
            { name: 'ECDH', namedCurve: 'P-256' },
          ];
        };

        module.exports = SEA.secret;
      })(USE, './secret');
      USE(function (module) {
        var SEA = USE('./root');
        // This is to certify that a group of "certificants" can "put" anything at a group of matched "paths" to the certificate authority's graph
        SEA.certify =
          SEA.certify ||
          (async (certificants, policy = {}, authority, cb, opt = {}) => {
            try {
              /*
		      The Certify Protocol was made out of love by a Vietnamese code enthusiast. Vietnamese people around the world deserve respect!
		      IMPORTANT: A Certificate is like a Signature. No one knows who (authority) created/signed a cert until you put it into their graph.
		      "certificants": '*' or a String (Bob.pub) || an Object that contains "pub" as a key || an array of [object || string]. These people will have the rights.
		      "policy": A string ('inbox'), or a RAD/LEX object {'*': 'inbox'}, or an Array of RAD/LEX objects or strings. RAD/LEX object can contain key "?" with indexOf("*") > -1 to force key equals certificant pub. This rule is used to check against soul+'/'+key using Gun.text.match or String.match.
		      "authority": Key pair or priv of the certificate authority.
		      "cb": A callback function after all things are done.
		      "opt": If opt.expiry (a timestamp) is set, SEA won't sync data after opt.expiry. If opt.block is set, SEA will look for block before syncing.
		      */
              console.log(
                'SEA.certify() is an early experimental community supported method that may change API behavior without warning in any future version.'
              );

              certificants = (() => {
                var data = [];
                if (certificants) {
                  if (
                    (typeof certificants === 'string' ||
                      Array.isArray(certificants)) &&
                    certificants.indexOf('*') > -1
                  )
                    return '*';
                  if (typeof certificants === 'string') return certificants;
                  if (Array.isArray(certificants)) {
                    if (certificants.length === 1 && certificants[0])
                      return typeof certificants[0] === 'object' &&
                        certificants[0].pub
                        ? certificants[0].pub
                        : typeof certificants[0] === 'string'
                        ? certificants[0]
                        : null;
                    certificants.map((certificant) => {
                      if (typeof certificant === 'string')
                        data.push(certificant);
                      else if (
                        typeof certificant === 'object' &&
                        certificant.pub
                      )
                        data.push(certificant.pub);
                    });
                  }

                  if (typeof certificants === 'object' && certificants.pub)
                    return certificants.pub;
                  return data.length > 0 ? data : null;
                }
                return;
              })();

              if (!certificants) return console.log('No certificant found.');

              const expiry =
                opt.expiry &&
                (typeof opt.expiry === 'number' ||
                  typeof opt.expiry === 'string')
                  ? parseFloat(opt.expiry)
                  : null;
              const readPolicy = (policy || {}).read ? policy.read : null;
              const writePolicy = (policy || {}).write
                ? policy.write
                : typeof policy === 'string' ||
                  Array.isArray(policy) ||
                  policy['+'] ||
                  policy['#'] ||
                  policy['.'] ||
                  policy['='] ||
                  policy['*'] ||
                  policy['>'] ||
                  policy['<']
                ? policy
                : null;
              // The "blacklist" feature is now renamed to "block". Why ? BECAUSE BLACK LIVES MATTER!
              // We can now use 3 keys: block, blacklist, ban
              const block =
                (opt || {}).block ||
                (opt || {}).blacklist ||
                (opt || {}).ban ||
                {};
              const readBlock =
                block.read &&
                (typeof block.read === 'string' || (block.read || {})['#'])
                  ? block.read
                  : null;
              const writeBlock =
                typeof block === 'string'
                  ? block
                  : block.write &&
                    (typeof block.write === 'string' || block.write['#'])
                  ? block.write
                  : null;

              if (!readPolicy && !writePolicy)
                return console.log('No policy found.');

              // reserved keys: c, e, r, w, rb, wb
              const data = JSON.stringify({
                c: certificants,
                ...(expiry ? { e: expiry } : {}), // inject expiry if possible
                ...(readPolicy ? { r: readPolicy } : {}), // "r" stands for read, which means read permission.
                ...(writePolicy ? { w: writePolicy } : {}), // "w" stands for write, which means write permission.
                ...(readBlock ? { rb: readBlock } : {}), // inject READ block if possible
                ...(writeBlock ? { wb: writeBlock } : {}), // inject WRITE block if possible
              });

              const certificate = await SEA.sign(data, authority, null, {
                raw: 1,
              });

              var r = certificate;
              if (!opt.raw) {
                r = 'SEA' + JSON.stringify(r);
              }
              if (cb) {
                try {
                  cb(r);
                } catch (e) {
                  console.log(e);
                }
              }
              return r;
            } catch (e) {
              SEA.err = e;
              if (SEA.throw) {
                throw e;
              }
              if (cb) {
                cb();
              }
              return;
            }
          });

        module.exports = SEA.certify;
      })(USE, './certify');
      USE(function (module) {
        var shim = USE('./shim');
        // Practical examples about usage found in tests.
        var SEA = USE('./root');
        SEA.work = USE('./work');
        SEA.sign = USE('./sign');
        SEA.verify = USE('./verify');
        SEA.encrypt = USE('./encrypt');
        SEA.decrypt = USE('./decrypt');
        SEA.certify = USE('./certify');
        //SEA.opt.aeskey = USE('./aeskey'); // not official! // this causes problems in latest WebCrypto.

        SEA.random = SEA.random || shim.random;

        // This is Buffer used in SEA and usable from Gun/SEA application also.
        // For documentation see https://nodejs.org/api/buffer.html
        SEA.Buffer = SEA.Buffer || USE('./buffer');

        // These SEA functions support now ony Promises or
        // async/await (compatible) code, use those like Promises.
        //
        // Creates a wrapper library around Web Crypto API
        // for various AES, ECDSA, PBKDF2 functions we called above.
        // Calculate public key KeyID aka PGPv4 (result: 8 bytes as hex string)
        SEA.keyid =
          SEA.keyid ||
          (async (pub) => {
            try {
              // base64('base64(x):base64(y)') => shim.Buffer(xy)
              const pb = shim.Buffer.concat(
                pub
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
                  .split('.')
                  .map((t) => shim.Buffer.from(t, 'base64'))
              );
              // id is PGPv4 compliant raw key
              const id = shim.Buffer.concat([
                shim.Buffer.from([0x99, pb.length / 0x100, pb.length % 0x100]),
                pb,
              ]);
              const sha1 = await sha1hash(id);
              const hash = shim.Buffer.from(sha1, 'binary');
              return hash.toString('hex', hash.length - 8); // 16-bit ID as hex
            } catch (e) {
              console.log(e);
              throw e;
            }
          });
        // all done!
        // Obviously it is missing MANY necessary features. This is only an alpha release.
        // Please experiment with it, audit what I've done so far, and complain about what needs to be added.
        // SEA should be a full suite that is easy and seamless to use.
        // Again, scroll naer the top, where I provide an EXAMPLE of how to create a user and sign in.
        // Once logged in, the rest of the code you just read handled automatically signing/validating data.
        // But all other behavior needs to be equally easy, like opinionated ways of
        // Adding friends (trusted public keys), sending private messages, etc.
        // Cheers! Tell me what you think.
        ((SEA.window || {}).GUN || {}).SEA = SEA;

        module.exports = SEA;
        // -------------- END SEA MODULES --------------------
        // -- BEGIN SEA+GUN MODULES: BUNDLED BY DEFAULT UNTIL OTHERS USE SEA ON OWN -------
      })(USE, './sea');
      USE(function (module) {
        var SEA = USE('./sea'),
          Gun,
          u;
        if (SEA.window) {
          Gun = SEA.window.GUN || { chain: {} };
        } else {
          Gun = USE((u + '' == typeof MODULE ? '.' : '') + './gun', 1);
        }
        SEA.GUN = Gun;

        function User(root) {
          this._ = { $: this };
        }
        User.prototype = (function () {
          function F() {}
          F.prototype = Gun.chain;
          return new F();
        })(); // Object.create polyfill
        User.prototype.constructor = User;

        // let's extend the gun chain with a `user` function.
        // only one user can be logged in at a time, per gun instance.
        Gun.chain.user = function (pub) {
          var gun = this,
            root = gun.back(-1),
            user;
          if (pub) {
            pub = SEA.opt.pub((pub._ || '')['#']) || pub;
            return root.get('~' + pub);
          }
          if ((user = root.back('user'))) {
            return user;
          }
          var root = root._,
            at = root,
            uuid = at.opt.uuid || lex;
          (at = (user = at.user = gun.chain(new User()))._).opt = {};
          at.opt.uuid = function (cb) {
            var id = uuid(),
              pub = root.user;
            if (!pub || !(pub = pub.is) || !(pub = pub.pub)) {
              return id;
            }
            id = '~' + pub + '/' + id;
            if (cb && cb.call) {
              cb(null, id);
            }
            return id;
          };
          return user;
        };
        function lex() {
          return Gun.state().toString(36).replace('.', '');
        }
        Gun.User = User;
        User.GUN = Gun;
        User.SEA = Gun.SEA = SEA;
        module.exports = User;
      })(USE, './user');
      USE(function (module) {
        var u,
          Gun =
            '' + u != typeof GUN
              ? GUN || { chain: {} }
              : USE(('' + u === typeof MODULE ? '.' : '') + './gun', 1);
        Gun.chain.then = function (cb, opt) {
          var gun = this,
            p = new Promise(function (res, rej) {
              gun.once(res, opt);
            });
          return cb ? p.then(cb) : p;
        };
      })(USE, './then');
      USE(function (module) {
        var User = USE('./user'),
          SEA = User.SEA,
          Gun = User.GUN,
          noop = function () {};

        // Well first we have to actually create a user. That is what this function does.
        User.prototype.create = function (...args) {
          var pair =
            typeof args[0] === 'object' && (args[0].pub || args[0].epub)
              ? args[0]
              : typeof args[1] === 'object' && (args[1].pub || args[1].epub)
              ? args[1]
              : null;
          var alias =
            pair && (pair.pub || pair.epub)
              ? pair.pub
              : typeof args[0] === 'string'
              ? args[0]
              : null;
          var pass =
            pair && (pair.pub || pair.epub)
              ? pair
              : alias && typeof args[1] === 'string'
              ? args[1]
              : null;
          var cb = args.filter((arg) => typeof arg === 'function')[0] || null; // cb now can stand anywhere, after alias/pass or pair
          var opt =
            args && args.length > 1 && typeof args[args.length - 1] === 'object'
              ? args[args.length - 1]
              : {}; // opt is always the last parameter which typeof === 'object' and stands after cb

          var gun = this,
            cat = gun._,
            root = gun.back(-1);
          cb = cb || noop;
          opt = opt || {};
          if (false !== opt.check) {
            var err;
            if (!alias) {
              err = 'No user.';
            }
            if ((pass || '').length < 8) {
              err = 'Password too short!';
            }
            if (err) {
              cb({ err: Gun.log(err) });
              return gun;
            }
          }
          if (cat.ing) {
            (cb || noop)({
              err: Gun.log('User is already being created or authenticated!'),
              wait: true,
            });
            return gun;
          }
          cat.ing = true;
          var act = {};
          act.a = function (pubs) {
            act.pubs = pubs;
            if (pubs && !opt.already) {
              // If we can enforce that a user name is already taken, it might be nice to try, but this is not guaranteed.
              var ack = { err: Gun.log('User already created!') };
              cat.ing = false;
              (cb || noop)(ack);
              gun.leave();
              return;
            }
            act.salt = String.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
            SEA.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
          };
          act.b = function (proof) {
            act.proof = proof;
            pair ? act.c(pair) : SEA.pair(act.c); // generate a brand new key pair or use the existing.
          };
          act.c = function (pair) {
            var tmp;
            act.pair = pair || {};
            if ((tmp = cat.root.user)) {
              tmp._.sea = pair;
              tmp.is = { pub: pair.pub, epub: pair.epub, alias: alias };
            }
            // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
            act.data = { pub: pair.pub };
            act.d();
          };
          act.d = function () {
            act.data.alias = alias;
            act.e();
          };
          act.e = function () {
            act.data.epub = act.pair.epub;
            SEA.encrypt(
              { priv: act.pair.priv, epriv: act.pair.epriv },
              act.proof,
              act.f,
              { raw: 1 }
            ); // to keep the private key safe, we AES encrypt it with the proof of work!
          };
          act.f = function (auth) {
            act.data.auth = JSON.stringify({ ek: auth, s: act.salt });
            act.g(act.data.auth);
          };
          act.g = function (auth) {
            var tmp;
            act.data.auth = act.data.auth || auth;
            root
              .get((tmp = '~' + act.pair.pub))
              .put(act.data)
              .on(act.h); // awesome, now we can actually save the user with their public key as their ID.
            var link = {};
            link[tmp] = { '#': tmp };
            root
              .get('~@' + alias)
              .put(link)
              .get(tmp)
              .on(act.i); // next up, we want to associate the alias with the public key. So we add it to the alias list.
          };
          act.h = function (data, key, msg, eve) {
            eve.off();
            act.h.ok = 1;
            act.i();
          };
          act.i = function (data, key, msg, eve) {
            if (eve) {
              act.i.ok = 1;
              eve.off();
            }
            if (!act.h.ok || !act.i.ok) {
              return;
            }
            cat.ing = false;
            cb({ ok: 0, pub: act.pair.pub }); // callback that the user has been created. (Note: ok = 0 because we didn't wait for disk to ack)
            if (noop === cb) {
              pair ? gun.auth(pair) : gun.auth(alias, pass);
            } // if no callback is passed, auto-login after signing up.
          };
          root.get('~@' + alias).once(act.a);
          return gun;
        };
        User.prototype.leave = function (opt, cb) {
          var gun = this,
            user = gun.back(-1)._.user;
          if (user) {
            delete user.is;
            delete user._.is;
            delete user._.sea;
          }
          if (SEA.window) {
            try {
              var sS = {};
              sS = SEA.window.sessionStorage;
              delete sS.recall;
              delete sS.pair;
            } catch (e) {}
          }
          return gun;
        };
      })(USE, './create');
      USE(function (module) {
        var User = USE('./user'),
          SEA = User.SEA,
          Gun = User.GUN,
          noop = function () {};
        // now that we have created a user, we want to authenticate them!
        User.prototype.auth = function (...args) {
          // TODO: this PR with arguments need to be cleaned up / refactored.
          var pair =
            typeof args[0] === 'object' && (args[0].pub || args[0].epub)
              ? args[0]
              : typeof args[1] === 'object' && (args[1].pub || args[1].epub)
              ? args[1]
              : null;
          var alias = !pair && typeof args[0] === 'string' ? args[0] : null;
          var pass =
            (alias || (pair && !(pair.priv && pair.epriv))) &&
            typeof args[1] === 'string'
              ? args[1]
              : null;
          var cb = args.filter((arg) => typeof arg === 'function')[0] || null; // cb now can stand anywhere, after alias/pass or pair
          var opt =
            args && args.length > 1 && typeof args[args.length - 1] === 'object'
              ? args[args.length - 1]
              : {}; // opt is always the last parameter which typeof === 'object' and stands after cb

          var gun = this,
            cat = gun._,
            root = gun.back(-1);

          if (cat.ing) {
            (cb || noop)({
              err: Gun.log('User is already being created or authenticated!'),
              wait: true,
            });
            return gun;
          }
          cat.ing = true;

          var act = {},
            u,
            tries = 9;
          act.a = function (data) {
            if (!data) {
              return act.b();
            }
            if (!data.pub) {
              var tmp = [];
              Object.keys(data).forEach(function (k) {
                if ('_' == k) {
                  return;
                }
                tmp.push(data[k]);
              });
              return act.b(tmp);
            }
            if (act.name) {
              return act.f(data);
            }
            act.c((act.data = data).auth);
          };
          act.b = function (list) {
            var get = (act.list = (act.list || []).concat(list || [])).shift();
            if (u === get) {
              if (act.name) {
                return act.err(
                  'Your user account is not published for dApps to access, please consider syncing it online, or allowing local access by adding your device as a peer.'
                );
              }
              if (alias && tries--) {
                root.get('~@' + alias).once(act.a);
                return;
              }
              return act.err('Wrong user or password.');
            }
            root.get(get).once(act.a);
          };
          act.c = function (auth) {
            if (u === auth) {
              return act.b();
            }
            if ('string' == typeof auth) {
              return act.c(obj_ify(auth));
            } // in case of legacy
            SEA.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
          };
          act.d = function (proof) {
            SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
          };
          act.e = function (half) {
            if (u === half) {
              if (!act.enc) {
                // try old format
                act.enc = { encode: 'utf8' };
                return act.c(act.auth);
              }
              act.enc = null; // end backwards
              return act.b();
            }
            act.half = half;
            act.f(act.data);
          };
          act.f = function (pair) {
            var half = act.half || {},
              data = act.data || {};
            act.g(
              (act.lol = {
                pub: pair.pub || data.pub,
                epub: pair.epub || data.epub,
                priv: pair.priv || half.priv,
                epriv: pair.epriv || half.epriv,
              })
            );
          };
          act.g = function (pair) {
            if (!pair || !pair.pub || !pair.epub) {
              return act.b();
            }
            act.pair = pair;
            var user = root._.user,
              at = user._;
            at.tag;
            var upt = at.opt;
            at = user._ = root.get('~' + pair.pub)._;
            at.opt = upt;
            // add our credentials in-memory only to our root user instance
            user.is = {
              pub: pair.pub,
              epub: pair.epub,
              alias: alias || pair.pub,
            };
            at.sea = act.pair;
            cat.ing = false;
            try {
              if (
                pass &&
                u == (obj_ify(cat.root.graph['~' + pair.pub].auth) || '')[':']
              ) {
                opt.shuffle = opt.change = pass;
              }
            } catch (e) {} // migrate UTF8 & Shuffle!
            opt.change ? act.z() : (cb || noop)(at);
            if (SEA.window && (gun.back('user')._.opt || opt).remember) {
              // TODO: this needs to be modular.
              try {
                var sS = {};
                sS = SEA.window.sessionStorage; // TODO: FIX BUG putting on `.is`!
                sS.recall = true;
                sS.pair = JSON.stringify(pair); // auth using pair is more reliable than alias/pass
              } catch (e) {}
            }
            try {
              if (root._.tag.auth) {
                // auth handle might not be registered yet
                root._.on('auth', at); // TODO: Deprecate this, emit on user instead! Update docs when you do.
              } else {
                setTimeout(function () {
                  root._.on('auth', at);
                }, 1);
              } // if not, hackily add a timeout.
              //at.on('auth', at) // Arrgh, this doesn't work without event "merge" code, but "merge" code causes stack overflow and crashes after logging in & trying to write data.
            } catch (e) {
              Gun.log("Your 'auth' callback crashed with:", e);
            }
          };
          act.h = function (data) {
            if (!data) {
              return act.b();
            }
            alias = data.alias;
            if (!alias) alias = data.alias = '~' + pair.pub;
            if (!data.auth) {
              return act.g(pair);
            }
            pair = null;
            act.c((act.data = data).auth);
          };
          act.z = function () {
            // password update so encrypt private key using new pwd + salt
            act.salt = String.random(64); // pseudo-random
            SEA.work(opt.change, act.salt, act.y);
          };
          act.y = function (proof) {
            SEA.encrypt(
              { priv: act.pair.priv, epriv: act.pair.epriv },
              proof,
              act.x,
              { raw: 1 }
            );
          };
          act.x = function (auth) {
            act.w(JSON.stringify({ ek: auth, s: act.salt }));
          };
          act.w = function (auth) {
            if (opt.shuffle) {
              // delete in future!
              console.log('migrate core account from UTF8 & shuffle');
              var tmp = {};
              Object.keys(act.data).forEach(function (k) {
                tmp[k] = act.data[k];
              });
              delete tmp._;
              tmp.auth = auth;
              root.get('~' + act.pair.pub).put(tmp);
            } // end delete
            root
              .get('~' + act.pair.pub)
              .get('auth')
              .put(auth, cb || noop);
          };
          act.err = function (e) {
            var ack = { err: Gun.log(e || 'User cannot be found!') };
            cat.ing = false;
            (cb || noop)(ack);
          };
          act.plugin = function (name) {
            if (!(act.name = name)) {
              return act.err();
            }
            var tmp = [name];
            if ('~' !== name[0]) {
              tmp[1] = '~' + name;
              tmp[2] = '~@' + name;
            }
            act.b(tmp);
          };
          if (pair) {
            if (pair.priv && pair.epriv) act.g(pair);
            else root.get('~' + pair.pub).once(act.h);
          } else if (alias) {
            root.get('~@' + alias).once(act.a);
          } else if (!alias && !pass) {
            SEA.name(act.plugin);
          }
          return gun;
        };
        function obj_ify(o) {
          if ('string' != typeof o) {
            return o;
          }
          try {
            o = JSON.parse(o);
          } catch (e) {
            o = {};
          }
          return o;
        }
      })(USE, './auth');
      USE(function (module) {
        var User = USE('./user'),
          SEA = User.SEA;
        User.GUN;
        User.prototype.recall = function (opt, cb) {
          var gun = this,
            root = gun.back(-1);
          opt = opt || {};
          if (opt && opt.sessionStorage) {
            if (SEA.window) {
              try {
                var sS = {};
                sS = SEA.window.sessionStorage; // TODO: FIX BUG putting on `.is`!
                if (sS) {
                  root._.opt.remember = true;
                  (gun.back('user')._.opt || opt).remember = true;
                  if (sS.recall || sS.pair)
                    root.user().auth(JSON.parse(sS.pair), cb); // pair is more reliable than alias/pass
                }
              } catch (e) {}
            }
            return gun;
          }
          /*
		        TODO: copy mhelander's expiry code back in.
		        Although, we should check with community,
		        should expiry be core or a plugin?
		      */
          return gun;
        };
      })(USE, './recall');
      USE(function (module) {
        var User = USE('./user'),
          SEA = User.SEA,
          Gun = User.GUN,
          noop = function () {};
        User.prototype.pair = function () {
          var user = this,
            proxy; // undeprecated, hiding with proxies.
          try {
            proxy = new Proxy(
              { DANGER: '\u2620' },
              {
                get: function (t, p, r) {
                  if (!user.is || !(user._ || '').sea) {
                    return;
                  }
                  return user._.sea[p];
                },
              }
            );
          } catch (e) {}
          return proxy;
        };
        // If authenticated user wants to delete his/her account, let's support it!
        User.prototype.delete = async function (alias, pass, cb) {
          console.log(
            'user.delete() IS DEPRECATED AND WILL BE MOVED TO A MODULE!!!'
          );
          var gun = this;
          gun.back(-1);
          var user = gun.back('user');
          try {
            user.auth(alias, pass, function (ack) {
              var pub = (user.is || {}).pub;
              // Delete user data
              user.map().once(function () {
                this.put(null);
              });
              // Wipe user data from memory
              user.leave();
              (cb || noop)({ ok: 0 });
            });
          } catch (e) {
            Gun.log('User.delete failed! Error:', e);
          }
          return gun;
        };
        User.prototype.alive = async function () {
          console.log('user.alive() IS DEPRECATED!!!');
          const gunRoot = this.back(-1);
          try {
            // All is good. Should we do something more with actual recalled data?
            await authRecall(gunRoot);
            return gunRoot._.user._;
          } catch (e) {
            const err = 'No session!';
            Gun.log(err);
            throw { err };
          }
        };
        User.prototype.trust = async function (user) {
          console.log(
            '`.trust` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!'
          );
          // TODO: BUG!!! SEA `node` read listener needs to be async, which means core needs to be async too.
          //gun.get('alice').get('age').trust(bob);
          if (Gun.is(user)) {
            user.get('pub').get((ctx, ev) => {
              console.log(ctx, ev);
            });
          }
          user.get('trust').get(path).put(theirPubkey);

          // do a lookup on this gun chain directly (that gets bob's copy of the data)
          // do a lookup on the metadata trust table for this path (that gets all the pubkeys allowed to write on this path)
          // do a lookup on each of those pubKeys ON the path (to get the collab data "layers")
          // THEN you perform Jachen's mix operation
          // and return the result of that to...
        };
        User.prototype.grant = function (to, cb) {
          console.log(
            '`.grant` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!'
          );
          var gun = this,
            user = gun.back(-1).user(),
            pair = user._.sea,
            path = '';
          gun.back(function (at) {
            if (at.is) {
              return;
            }
            path += at.get || '';
          });
          (async function () {
            var enc,
              sec = await user.get('grant').get(pair.pub).get(path).then();
            sec = await SEA.decrypt(sec, pair);
            if (!sec) {
              sec = SEA.random(16).toString();
              enc = await SEA.encrypt(sec, pair);
              user.get('grant').get(pair.pub).get(path).put(enc);
            }
            var pub = to.get('pub').then();
            var epub = to.get('epub').then();
            pub = await pub;
            epub = await epub;
            var dh = await SEA.secret(epub, pair);
            enc = await SEA.encrypt(sec, dh);
            user.get('grant').get(pub).get(path).put(enc, cb);
          })();
          return gun;
        };
        User.prototype.secret = function (data, cb) {
          console.log(
            '`.secret` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!'
          );
          var gun = this,
            user = gun.back(-1).user(),
            pair = user.pair(),
            path = '';
          gun.back(function (at) {
            if (at.is) {
              return;
            }
            path += at.get || '';
          });
          (async function () {
            var enc,
              sec = await user.get('trust').get(pair.pub).get(path).then();
            sec = await SEA.decrypt(sec, pair);
            if (!sec) {
              sec = SEA.random(16).toString();
              enc = await SEA.encrypt(sec, pair);
              user.get('trust').get(pair.pub).get(path).put(enc);
            }
            enc = await SEA.encrypt(data, sec);
            gun.put(enc, cb);
          })();
          return gun;
        };

        /**
		     * returns the decrypted value, encrypted by secret
		     * @returns {Promise<any>}
		     // Mark needs to review 1st before officially supported
		    User.prototype.decrypt = function(cb) {
		      let gun = this,
		        path = ''
		      gun.back(function(at) {
		        if (at.is) {
		          return
		        }
		        path += at.get || ''
		      })
		      return gun
		        .then(async data => {
		          if (data == null) {
		            return
		          }
		          const user = gun.back(-1).user()
		          const pair = user.pair()
		          let sec = await user
		            .get('trust')
		            .get(pair.pub)
		            .get(path)
		          sec = await SEA.decrypt(sec, pair)
		          if (!sec) {
		            return data
		          }
		          let decrypted = await SEA.decrypt(data, sec)
		          return decrypted
		        })
		        .then(res => {
		          cb && cb(res)
		          return res
		        })
		    }
		    */
        module.exports = User;
      })(USE, './share');
      USE(function (module) {
        var SEA = USE('./sea'),
          S = USE('./settings'),
          u;
        var Gun =
          (SEA.window || '').GUN ||
          USE(('' + u === typeof MODULE ? '.' : '') + './gun', 1);
        // After we have a GUN extension to make user registration/login easy, we then need to handle everything else.

        // We do this with a GUN adapter, we first listen to when a gun instance is created (and when its options change)
        Gun.on('opt', function (at) {
          if (!at.sea) {
            // only add SEA once per instance, on the "at" context.
            at.sea = { own: {} };
            at.on('put', check, at); // SEA now runs its firewall on HAM diffs, not all i/o.
          }
          this.to.next(at); // make sure to call the "next" middleware adapter.
        });

        // Alright, this next adapter gets run at the per node level in the graph database.
        // correction: 2020 it gets run on each key/value pair in a node upon a HAM diff.
        // This will let us verify that every property on a node has a value signed by a public key we trust.
        // If the signature does not match, the data is just `undefined` so it doesn't get passed on.
        // If it does match, then we transform the in-memory "view" of the data into its plain value (without the signature).
        // Now NOTE! Some data is "system" data, not user data. Example: List of public keys, aliases, etc.
        // This data is self-enforced (the value can only match its ID), but that is handled in the `security` function.
        // From the self-enforced data, we can see all the edges in the graph that belong to a public key.
        // Example: ~ASDF is the ID of a node with ASDF as its public key, signed alias and salt, and
        // its encrypted private key, but it might also have other signed values on it like `profile = <ID>` edge.
        // Using that directed edge's ID, we can then track (in memory) which IDs belong to which keys.
        // Here is a problem: Multiple public keys can "claim" any node's ID, so this is dangerous!
        // This means we should ONLY trust our "friends" (our key ring) public keys, not any ones.
        // I have not yet added that to SEA yet in this alpha release. That is coming soon, but beware in the meanwhile!

        function check(msg) {
          // REVISE / IMPROVE, NO NEED TO PASS MSG/EVE EACH SUB?
          var eve = this,
            at = eve.as,
            put = msg.put,
            soul = put['#'],
            key = put['.'],
            val = put[':'],
            state = put['>'],
            id = msg['#'],
            tmp;
          if (!soul || !key) {
            return;
          }
          if (
            (msg._ || '').faith &&
            (at.opt || '').faith &&
            'function' == typeof msg._
          ) {
            SEA.opt.pack(put, function (raw) {
              SEA.verify(raw, false, function (data) {
                // this is synchronous if false
                put['='] = SEA.opt.unpack(data);
                eve.to.next(msg);
              });
            });
            return;
          }
          var no = function (why) {
            at.on('in', { '@': id, err: (msg.err = why) });
          }; // exploit internal relay stun for now, maybe violates spec, but testing for now. // Note: this may be only the sharded message, not original batch.
          //var no = function(why){ msg.ack(why) };
          (msg._ || '').DBG && ((msg._ || '').DBG.c = +new Date());
          if (0 <= soul.indexOf('<?')) {
            // special case for "do not sync data X old" forget
            // 'a~pub.key/b<?9'
            tmp = parseFloat(soul.split('<?')[1] || '');
            if (tmp && state < Gun.state() - tmp * 1000) {
              // sec to ms
              (tmp = msg._) && tmp.stun && tmp.stun--; // THIS IS BAD CODE! It assumes GUN internals do something that will probably change in future, but hacking in now.
              return; // omit!
            }
          }

          if ('~@' === soul) {
            // special case for shared system data, the list of aliases.
            check.alias(eve, msg, val, key, soul, at, no);
            return;
          }
          if ('~@' === soul.slice(0, 2)) {
            // special case for shared system data, the list of public keys for an alias.
            check.pubs(eve, msg, val, key, soul, at, no);
            return;
          }
          //if('~' === soul.slice(0,1) && 2 === (tmp = soul.slice(1)).split('.').length){ // special case, account data for a public key.
          if ((tmp = SEA.opt.pub(soul))) {
            // special case, account data for a public key.
            check.pub(eve, msg, val, key, soul, at, no, at.user || '', tmp);
            return;
          }
          if (0 <= soul.indexOf('#')) {
            // special case for content addressing immutable hashed data.
            check.hash(eve, msg, val, key, soul, at, no);
            return;
          }
          check.any(eve, msg, val, key, soul, at, no, at.user || '');
          return;
        }
        check.hash = function (eve, msg, val, key, soul, at, no) {
          // mark unbuilt @i001962 's epic hex contrib!
          SEA.work(
            val,
            null,
            function (data) {
              function hexToBase64(hexStr) {
                let base64 = '';
                for (let i = 0; i < hexStr.length; i++) {
                  base64 += !((i - 1) & 1)
                    ? String.fromCharCode(
                        parseInt(hexStr.substring(i - 1, i + 1), 16)
                      )
                    : '';
                }
                return btoa(base64);
              }
              if (data && data === key.split('#').slice(-1)[0]) {
                return eve.to.next(msg);
              } else if (
                data &&
                data === hexToBase64(key.split('#').slice(-1)[0])
              ) {
                return eve.to.next(msg);
              }
              no('Data hash not same as hash!');
            },
            { name: 'SHA-256' }
          );
        };
        check.alias = function (eve, msg, val, key, soul, at, no) {
          // Example: {_:#~@, ~@alice: {#~@alice}}
          if (!val) {
            return no('Data must exist!');
          } // data MUST exist
          if ('~@' + key === link_is(val)) {
            return eve.to.next(msg);
          } // in fact, it must be EXACTLY equal to itself
          no('Alias not same!'); // if it isn't, reject.
        };
        check.pubs = function (eve, msg, val, key, soul, at, no) {
          // Example: {_:#~@alice, ~asdf: {#~asdf}}
          if (!val) {
            return no('Alias must exist!');
          } // data MUST exist
          if (key === link_is(val)) {
            return eve.to.next(msg);
          } // and the ID must be EXACTLY equal to its property
          no('Alias not same!'); // that way nobody can tamper with the list of public keys.
        };
        check.pub = async function (
          eve,
          msg,
          val,
          key,
          soul,
          at,
          no,
          user,
          pub
        ) {
          var tmp; // Example: {_:#~asdf, hello:'world'~fdsa}}
          const raw = (await S.parse(val)) || {};
          const verify = (certificate, certificant, cb) => {
            if (certificate.m && certificate.s && certificant && pub)
              // now verify certificate
              return SEA.verify(certificate, pub, (data) => {
                // check if "pub" (of the graph owner) really issued this cert
                if (
                  u !== data &&
                  u !== data.e &&
                  msg.put['>'] &&
                  msg.put['>'] > parseFloat(data.e)
                )
                  return no('Certificate expired.'); // certificate expired
                // "data.c" = a list of certificants/certified users
                // "data.w" = lex WRITE permission, in the future, there will be "data.r" which means lex READ permission
                if (
                  u !== data &&
                  data.c &&
                  data.w &&
                  (data.c === certificant || data.c.indexOf('*') > -1)
                ) {
                  // ok, now "certificant" is in the "certificants" list, but is "path" allowed? Check path
                  let path =
                    soul.indexOf('/') > -1
                      ? soul.replace(
                          soul.substring(0, soul.indexOf('/') + 1),
                          ''
                        )
                      : '';
                  String.match = String.match || Gun.text.match;
                  const w = Array.isArray(data.w)
                    ? data.w
                    : typeof data.w === 'object' || typeof data.w === 'string'
                    ? [data.w]
                    : [];
                  for (const lex of w) {
                    if (
                      (String.match(path, lex['#']) &&
                        String.match(key, lex['.'])) ||
                      (!lex['.'] && String.match(path, lex['#'])) ||
                      (!lex['#'] && String.match(key, lex['.'])) ||
                      String.match(
                        path ? path + '/' + key : key,
                        lex['#'] || lex
                      )
                    ) {
                      // is Certificant forced to present in Path
                      if (
                        lex['+'] &&
                        lex['+'].indexOf('*') > -1 &&
                        path &&
                        path.indexOf(certificant) == -1 &&
                        key.indexOf(certificant) == -1
                      )
                        return no(
                          `Path "${path}" or key "${key}" must contain string "${certificant}".`
                        );
                      // path is allowed, but is there any WRITE block? Check it out
                      if (
                        data.wb &&
                        (typeof data.wb === 'string' || (data.wb || {})['#'])
                      ) {
                        // "data.wb" = path to the WRITE block
                        var root = eve.as.root.$.back(-1);
                        if (
                          typeof data.wb === 'string' &&
                          '~' !== data.wb.slice(0, 1)
                        )
                          root = root.get('~' + pub);
                        return root
                          .get(data.wb)
                          .get(certificant)
                          .once((value) => {
                            // TODO: INTENT TO DEPRECATE.
                            if (value && (value === 1 || value === true))
                              return no(`Certificant ${certificant} blocked.`);
                            return cb(data);
                          });
                      }
                      return cb(data);
                    }
                  }
                  return no('Certificate verification fail.');
                }
              });
            return;
          };

          if ('pub' === key && '~' + pub === soul) {
            if (val === pub) return eve.to.next(msg); // the account MUST match `pub` property that equals the ID of the public key.
            return no('Account not same!');
          }

          if (
            (tmp = user.is) &&
            tmp.pub &&
            !raw['*'] &&
            !raw['+'] &&
            (pub === tmp.pub ||
              (pub !== tmp.pub && ((msg._.msg || {}).opt || {}).cert))
          ) {
            SEA.opt.pack(msg.put, (packed) => {
              SEA.sign(
                packed,
                user._.sea,
                async function (data) {
                  if (u === data) return no(SEA.err || 'Signature fail.');
                  msg.put[':'] = {
                    ':': (tmp = SEA.opt.unpack(data.m)),
                    '~': data.s,
                  };
                  msg.put['='] = tmp;

                  // if writing to own graph, just allow it
                  if (pub === user.is.pub) {
                    if ((tmp = link_is(val)))
                      (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1;
                    JSON.stringifyAsync(msg.put[':'], function (err, s) {
                      if (err) {
                        return no(err || 'Stringify error.');
                      }
                      msg.put[':'] = s;
                      return eve.to.next(msg);
                    });
                    return;
                  }

                  // if writing to other's graph, check if cert exists then try to inject cert into put, also inject self pub so that everyone can verify the put
                  if (
                    pub !== user.is.pub &&
                    ((msg._.msg || {}).opt || {}).cert
                  ) {
                    const cert = await S.parse(msg._.msg.opt.cert);
                    // even if cert exists, we must verify it
                    if (cert && cert.m && cert.s)
                      verify(cert, user.is.pub, (_) => {
                        msg.put[':']['+'] = cert; // '+' is a certificate
                        msg.put[':']['*'] = user.is.pub; // '*' is pub of the user who puts
                        JSON.stringifyAsync(msg.put[':'], function (err, s) {
                          if (err) {
                            return no(err || 'Stringify error.');
                          }
                          msg.put[':'] = s;
                          return eve.to.next(msg);
                        });
                        return;
                      });
                  }
                },
                { raw: 1 }
              );
            });
            return;
          }

          SEA.opt.pack(msg.put, (packed) => {
            SEA.verify(packed, raw['*'] || pub, function (data) {
              var tmp;
              data = SEA.opt.unpack(data);
              if (u === data) return no('Unverified data.'); // make sure the signature matches the account it claims to be on. // reject any updates that are signed with a mismatched account.
              if ((tmp = link_is(data)) && pub === SEA.opt.pub(tmp))
                (at.sea.own[tmp] = at.sea.own[tmp] || {})[pub] = 1;

              // check if cert ('+') and putter's pub ('*') exist
              if (raw['+'] && raw['+']['m'] && raw['+']['s'] && raw['*'])
                // now verify certificate
                verify(raw['+'], raw['*'], (_) => {
                  msg.put['='] = data;
                  return eve.to.next(msg);
                });
              else {
                msg.put['='] = data;
                return eve.to.next(msg);
              }
            });
          });
          return;
        };
        check.any = function (eve, msg, val, key, soul, at, no, user) {
          if (at.opt.secure) {
            return no("Soul missing public key at '" + key + "'.");
          }
          // TODO: Ask community if should auto-sign non user-graph data.
          at.on('secure', function (msg) {
            this.off();
            if (!at.opt.secure) {
              return eve.to.next(msg);
            }
            no('Data cannot be changed.');
          }).on.on('secure', msg);
          return;
        };

        var valid = Gun.valid,
          link_is = function (d, l) {
            return 'string' == typeof (l = valid(d)) && l;
          };
        (Gun.state || '').ify;

        var pubcut = /[^\w_-]/; // anything not alphanumeric or _ -
        SEA.opt.pub = function (s) {
          if (!s) {
            return;
          }
          s = s.split('~');
          if (!s || !(s = s[1])) {
            return;
          }
          s = s.split(pubcut).slice(0, 2);
          if (!s || 2 != s.length) {
            return;
          }
          if ('@' === (s[0] || '')[0]) {
            return;
          }
          s = s.slice(0, 2).join('.');
          return s;
        };
        SEA.opt.stringy = function (t) {
          // TODO: encrypt etc. need to check string primitive. Make as breaking change.
        };
        SEA.opt.pack = function (d, cb, k, n, s) {
          var tmp, f; // pack for verifying
          if (SEA.opt.check(d)) {
            return cb(d);
          }
          if (d && d['#'] && d['.'] && d['>']) {
            tmp = d[':'];
            f = 1;
          }
          JSON.parseAsync(f ? tmp : d, function (err, meta) {
            var sig = u !== (meta || '')[':'] && (meta || '')['~']; // or just ~ check?
            if (!sig) {
              cb(d);
              return;
            }
            cb({
              m: {
                '#': s || d['#'],
                '.': k || d['.'],
                ':': (meta || '')[':'],
                '>': d['>'] || Gun.state.is(n, k),
              },
              s: sig,
            });
          });
        };
        var O = SEA.opt;
        SEA.opt.unpack = function (d, k, n) {
          var tmp;
          if (u === d) {
            return;
          }
          if (d && u !== (tmp = d[':'])) {
            return tmp;
          }
          k = k || O.fall_key;
          if (!n && O.fall_val) {
            n = {};
            n[k] = O.fall_val;
          }
          if (!k || !n) {
            return;
          }
          if (d === n[k]) {
            return d;
          }
          if (!SEA.opt.check(n[k])) {
            return d;
          }
          var soul = (n && n._ && n._['#']) || O.fall_soul,
            s = Gun.state.is(n, k) || O.fall_state;
          if (
            d &&
            4 === d.length &&
            soul === d[0] &&
            k === d[1] &&
            fl(s) === fl(d[3])
          ) {
            return d[2];
          }
          if (s < SEA.opt.shuffle_attack) {
            return d;
          }
        };
        SEA.opt.shuffle_attack = 1546329600000; // Jan 1, 2019
        var fl = Math.floor; // TODO: Still need to fix inconsistent state issue.
        // TODO: Potential bug? If pub/priv key starts with `-`? IDK how possible.
      })(USE, './index');
    })();
  })(sea);
  return sea.exports;
}

var seaExports = requireSea();
var SEA$2 = /*@__PURE__*/ getDefaultExportFromCjs(seaExports);

var then = {};

var hasRequiredThen;

function requireThen() {
  if (hasRequiredThen) return then;
  hasRequiredThen = 1;
  var Gun = typeof window !== 'undefined' ? window.Gun : requireGun();

  // Returns a gun reference in a promise and then calls a callback if specified
  Gun.chain.promise = function (cb) {
    var gun = this,
      cb =
        cb ||
        function (ctx) {
          return ctx;
        };
    return new Promise(function (res, rej) {
      gun.once(function (data, key) {
        res({ put: data, get: key, gun: this }); // gun reference is returned by promise
      });
    }).then(cb); //calling callback with resolved data
  };

  // Returns a promise for the data, key of the gun call
  Gun.chain.then = function (cb) {
    var gun = this;
    var p = new Promise((res, rej) => {
      gun.once(function (data, key) {
        res(data, key); //call resolve when data is returned
      });
    });
    return cb ? p.then(cb) : p;
  };
  return then;
}

requireThen();

var load = {};

var open = {};

var hasRequiredOpen;

function requireOpen() {
  if (hasRequiredOpen) return open;
  hasRequiredOpen = 1;
  var Gun = typeof window !== 'undefined' ? window.Gun : requireGun();

  Gun.chain.open = function (cb, opt, at, depth) {
    // this is a recursive function, BEWARE!
    depth = depth || 1;
    opt = opt || {}; // init top level options.
    opt.doc = opt.doc || {};
    opt.ids = opt.ids || {};
    opt.any = opt.any || cb;
    opt.meta = opt.meta || false;
    opt.eve = opt.eve || {
      off: function () {
        // collect all recursive events to unsubscribe to if needed.
        Object.keys(opt.eve.s).forEach(function (i, e) {
          // switch to CPU scheduled setTimeout.each?
          if ((e = opt.eve.s[i])) {
            e.off();
          }
        });
        opt.eve.s = {};
      },
      s: {},
    };
    return this.on(function (data, key, ctx, eve) {
      // subscribe to 1 deeper of data!
      clearTimeout(opt.to); // do not trigger callback if bunch of changes...
      opt.to = setTimeout(function () {
        // but schedule the callback to fire soon!
        if (!opt.any) {
          return;
        }
        opt.any.call(opt.at.$, opt.doc, opt.key, opt, opt.eve); // call it.
        if (opt.off) {
          // check for unsubscribing.
          opt.eve.off();
          opt.any = null;
        }
      }, opt.wait || 9);
      opt.at = opt.at || ctx; // opt.at will always be the first context it finds.
      opt.key = opt.key || key;
      opt.eve.s[this._.id] = eve; // collect all the events together.
      if (true === Gun.valid(data)) {
        // if primitive value...
        if (!at) {
          opt.doc = data;
        } else {
          at[key] = data;
        }
        return;
      }
      var tmp = this; // else if a sub-object, CPU schedule loop over properties to do recursion.
      setTimeout.each(Object.keys(data), function (key, val) {
        if ('_' === key && !opt.meta) {
          return;
        }
        val = data[key];
        var doc = at || opt.doc,
          id; // first pass this becomes the root of open, then at is passed below, and will be the parent for each sub-document/object.
        if (!doc) {
          return;
        } // if no "parent"
        if ('string' !== typeof (id = Gun.valid(val))) {
          // if primitive...
          doc[key] = val;
          return;
        }
        if (opt.ids[id]) {
          // if we've already seen this sub-object/document
          doc[key] = opt.ids[id]; // link to itself, our already in-memory one, not a new copy.
          return;
        }
        if (opt.depth <= depth) {
          // stop recursive open at max depth.
          doc[key] = doc[key] || val; // show link so app can load it if need.
          return;
        } // now open up the recursion of sub-documents!
        tmp
          .get(key)
          .open(opt.any, opt, (opt.ids[id] = doc[key] = {}), depth + 1); // 3rd param is now where we are "at".
      });
    });
  };
  return open;
}

var hasRequiredLoad;

function requireLoad() {
  if (hasRequiredLoad) return load;
  hasRequiredLoad = 1;
  var Gun = typeof window !== 'undefined' ? window.Gun : requireGun();
  Gun.chain.open || requireOpen();

  Gun.chain.load = function (cb, opt, at) {
    (opt = opt || {}).off = !0;
    return this.open(cb, opt, at);
  };
  return load;
}

requireLoad();

requireOpen();

var radix = { exports: {} };

var hasRequiredRadix;

function requireRadix() {
  if (hasRequiredRadix) return radix.exports;
  hasRequiredRadix = 1;
  (function () {
    function Radix() {
      var radix = function (key, val, t) {
        radix.unit = 0;
        if (!t && u !== val) {
          radix.last = '' + key < radix.last ? radix.last : '' + key;
          delete (radix.$ || {})[_];
        }
        t = t || radix.$ || (radix.$ = {});
        if (!key && Object.keys(t).length) {
          return t;
        }
        key = '' + key;
        var i = 0,
          l = key.length - 1,
          k = key[i],
          at,
          tmp;
        while (!(at = t[k]) && i < l) {
          k += key[++i];
        }
        if (!at) {
          if (
            !each(t, function (r, s) {
              var ii = 0,
                kk = '';
              if ((s || '').length) {
                while (s[ii] == key[ii]) {
                  kk += s[ii++];
                }
              }
              if (kk) {
                if (u === val) {
                  if (ii <= l) {
                    return;
                  }
                  (tmp || (tmp = {}))[s.slice(ii)] = r;
                  //(tmp[_] = function $(){ $.sort = Object.keys(tmp).sort(); return $ }()); // get rid of this one, cause it is on read?
                  return r;
                }
                var __ = {};
                __[s.slice(ii)] = r;
                ii = key.slice(ii);
                '' === ii ? (__[''] = val) : ((__[ii] = {})[''] = val);
                //(__[_] = function $(){ $.sort = Object.keys(__).sort(); return $ }());
                t[kk] = __;
                if (Radix.debug && 'undefined' === '' + kk) {
                  console.log(0, kk);
                  debugger;
                }
                delete t[s];
                //(t[_] = function $(){ $.sort = Object.keys(t).sort(); return $ }());
                return true;
              }
            })
          ) {
            if (u === val) {
              return;
            }
            (t[k] || (t[k] = {}))[''] = val;
            if (Radix.debug && 'undefined' === '' + k) {
              console.log(1, k);
              debugger;
            }
            //(t[_] = function $(){ $.sort = Object.keys(t).sort(); return $ }());
          }
          if (u === val) {
            return tmp;
          }
        } else if (i == l) {
          //if(u === val){ return (u === (tmp = at['']))? at : tmp } // THIS CODE IS CORRECT, below is
          if (u === val) {
            return u === (tmp = at['']) ? at : (radix.unit = 1) && tmp;
          } // temporary help??
          at[''] = val;
          //(at[_] = function $(){ $.sort = Object.keys(at).sort(); return $ }());
        } else {
          if (u !== val) {
            delete at[_];
          }
          //at && (at[_] = function $(){ $.sort = Object.keys(at).sort(); return $ }());
          return radix(key.slice(++i), val, at || (at = {}));
        }
      };
      return radix;
    }
    Radix.map = function rap(radix, cb, opt, pre) {
      try {
        pre = pre || []; // TODO: BUG: most out-of-memory crashes come from here.
        var t = 'function' == typeof radix ? radix.$ || {} : radix;
        //!opt && console.log("WHAT IS T?", JSON.stringify(t).length);
        if (!t) {
          return;
        }
        if ('string' == typeof t) {
          if (Radix.debug) {
            throw ['BUG:', radix, cb, opt, pre];
          }
          return;
        }
        var keys =
            (t[_] || no).sort ||
            (t[_] = (function $() {
              $.sort = Object.keys(t).sort();
              return $;
            })()).sort,
          rev; // ONLY 17% of ops are pre-sorted!
        //var keys = Object.keys(t).sort();
        opt = true === opt ? { branch: true } : opt || {};
        if ((rev = opt.reverse)) {
          keys = keys.slice(0).reverse();
        }
        var start = opt.start,
          end = opt.end,
          END = '\uffff';
        var i = 0,
          l = keys.length;
        for (; i < l; i++) {
          var key = keys[i],
            tree = t[key],
            tmp,
            p,
            pt;
          if (!tree || '' === key || _ === key || 'undefined' === key) {
            continue;
          }
          p = pre.slice(0);
          p.push(key);
          pt = p.join('');
          if (u !== start && pt < (start || '').slice(0, pt.length)) {
            continue;
          }
          if (u !== end && (end || END) < pt) {
            continue;
          }
          if (rev) {
            // children must be checked first when going in reverse.
            tmp = rap(tree, cb, opt, p);
            if (u !== tmp) {
              return tmp;
            }
          }
          if (u !== (tmp = tree[''])) {
            var yes = 1;
            if (u !== start && pt < (start || '')) {
              yes = 0;
            }
            if (u !== end && pt > (end || END)) {
              yes = 0;
            }
            if (yes) {
              tmp = cb(tmp, pt, key, pre);
              if (u !== tmp) {
                return tmp;
              }
            }
          } else if (opt.branch) {
            tmp = cb(u, pt, key, pre);
            if (u !== tmp) {
              return tmp;
            }
          }
          pre = p;
          if (!rev) {
            tmp = rap(tree, cb, opt, pre);
            if (u !== tmp) {
              return tmp;
            }
          }
          pre.pop();
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (typeof window !== 'undefined') {
      window.Radix = Radix;
    } else {
      try {
        radix.exports = Radix;
      } catch (e) {}
    }
    var each = (Radix.object = function (o, f, r) {
        for (var k in o) {
          if (!o.hasOwnProperty(k)) {
            continue;
          }
          if ((r = f(o[k], k)) !== u) {
            return r;
          }
        }
      }),
      no = {},
      u;
    var _ = String.fromCharCode(24);
  })();
  return radix.exports;
}

requireRadix();

var radisk = { exports: {} };

var yson = { exports: {} };

var hasRequiredYson;

function requireYson() {
  if (hasRequiredYson) return yson.exports;
  hasRequiredYson = 1;
  (function (module) {
    (function () {
      // JSON: JavaScript Object Notation
      // YSON: Yielding javaScript Object Notation
      var yson = {},
        u,
        sI =
          setTimeout.turn ||
          (typeof setTimeout != '' + u && setTimeout) ||
          setTimeout;

      yson.parseAsync = function (text, done, revive, M) {
        if ('string' != typeof text) {
          try {
            done(u, JSON.parse(text));
          } catch (e) {
            done(e);
          }
          return;
        }
        var ctx = { i: 0, text: text, done: done, l: text.length, up: [] };
        //M = 1024 * 1024 * 100;
        //M = M || 1024 * 64;
        M = M || 1024 * 32;
        parse();
        function parse() {
          //var S = +new Date;
          var s = ctx.text;
          var i = ctx.i,
            l = ctx.l,
            j = 0;
          var w = ctx.w,
            b,
            tmp;
          while (j++ < M) {
            var c = s[i++];
            if (i > l) {
              ctx.end = true;
              break;
            }
            if (w) {
              i = s.indexOf('"', i - 1);
              c = s[i];
              tmp = 0;
              while ('\\' == s[i - ++tmp]) {}
              tmp = !(tmp % 2); //tmp = ('\\' == s[i-1]); // json is stupid
              b = b || tmp;
              if ('"' == c && !tmp) {
                w = u;
                tmp = ctx.s;
                if (ctx.a) {
                  tmp = s.slice(ctx.sl, i);
                  if (b || 1 + tmp.indexOf('\\')) {
                    tmp = JSON.parse('"' + tmp + '"');
                  } // escape + unicode :( handling
                  if (ctx.at instanceof Array) {
                    ctx.at.push((ctx.s = tmp));
                  } else {
                    if (!ctx.at) {
                      ctx.end = j = M;
                      tmp = u;
                    }
                    (ctx.at || {})[ctx.s] = ctx.s = tmp;
                  }
                  ctx.s = u;
                } else {
                  ctx.s = s.slice(ctx.sl, i);
                  if (b || 1 + ctx.s.indexOf('\\')) {
                    ctx.s = JSON.parse('"' + ctx.s + '"');
                  } // escape + unicode :( handling
                }
                ctx.a = b = u;
              }
              ++i;
            } else {
              switch (c) {
                case '"':
                  ctx.sl = i;
                  w = true;
                  break;
                case ':':
                  ctx.ai = i;
                  ctx.a = true;
                  break;
                case ',':
                  if (ctx.a || ctx.at instanceof Array) {
                    if ((tmp = s.slice(ctx.ai, i - 1))) {
                      if (u !== (tmp = value(tmp))) {
                        if (ctx.at instanceof Array) {
                          ctx.at.push(tmp);
                        } else {
                          ctx.at[ctx.s] = tmp;
                        }
                      }
                    }
                  }
                  ctx.a = u;
                  if (ctx.at instanceof Array) {
                    ctx.a = true;
                    ctx.ai = i;
                  }
                  break;
                case '{':
                  ctx.up.push(ctx.at || (ctx.at = {}));
                  if (ctx.at instanceof Array) {
                    ctx.at.push((ctx.at = {}));
                  } else if (u !== (tmp = ctx.s)) {
                    ctx.at[tmp] = ctx.at = {};
                  }
                  ctx.a = u;
                  break;
                case '}':
                  if (ctx.a) {
                    if ((tmp = s.slice(ctx.ai, i - 1))) {
                      if (u !== (tmp = value(tmp))) {
                        if (ctx.at instanceof Array) {
                          ctx.at.push(tmp);
                        } else {
                          if (!ctx.at) {
                            ctx.end = j = M;
                            tmp = u;
                          }
                          (ctx.at || {})[ctx.s] = tmp;
                        }
                      }
                    }
                  }
                  ctx.a = u;
                  ctx.at = ctx.up.pop();
                  break;
                case '[':
                  if (u !== (tmp = ctx.s)) {
                    ctx.up.push(ctx.at);
                    ctx.at[tmp] = ctx.at = [];
                  } else if (!ctx.at) {
                    ctx.up.push((ctx.at = []));
                  }
                  ctx.a = true;
                  ctx.ai = i;
                  break;
                case ']':
                  if (ctx.a) {
                    if ((tmp = s.slice(ctx.ai, i - 1))) {
                      if (u !== (tmp = value(tmp))) {
                        if (ctx.at instanceof Array) {
                          ctx.at.push(tmp);
                        } else {
                          ctx.at[ctx.s] = tmp;
                        }
                      }
                    }
                  }
                  ctx.a = u;
                  ctx.at = ctx.up.pop();
                  break;
              }
            }
          }
          ctx.s = u;
          ctx.i = i;
          ctx.w = w;
          if (ctx.end) {
            tmp = ctx.at;
            if (u === tmp) {
              try {
                tmp = JSON.parse(text);
              } catch (e) {
                return ctx.done(e);
              }
            }
            ctx.done(u, tmp);
          } else {
            sI(parse);
          }
        }
      };
      function value(s) {
        var n = parseFloat(s);
        if (!isNaN(n)) {
          return n;
        }
        s = s.trim();
        if ('true' == s) {
          return true;
        }
        if ('false' == s) {
          return false;
        }
        if ('null' == s) {
          return null;
        }
      }

      yson.stringifyAsync = function (data, done, replacer, space, ctx) {
        //try{done(u, JSON.stringify(data, replacer, space))}catch(e){done(e)}return;
        ctx = ctx || {};
        ctx.text = ctx.text || '';
        ctx.up = [(ctx.at = { d: data })];
        ctx.done = done;
        ctx.i = 0;
        var j = 0;
        ify();
        function ify() {
          var at = ctx.at,
            data = at.d,
            add = '',
            tmp;
          if (at.i && at.i - at.j > 0) {
            add += ',';
          }
          if (u !== (tmp = at.k)) {
            add += JSON.stringify(tmp) + ':';
          } //'"'+tmp+'":' } // only if backslash
          switch (typeof data) {
            case 'boolean':
              add += '' + data;
              break;
            case 'string':
              add += JSON.stringify(data); //ctx.text += '"'+data+'"';//JSON.stringify(data); // only if backslash
              break;
            case 'number':
              add += isNaN(data) ? 'null' : data;
              break;
            case 'object':
              if (!data) {
                add += 'null';
                break;
              }
              if (data instanceof Array) {
                add += '[';
                at = { i: -1, as: data, up: at, j: 0 };
                at.l = data.length;
                ctx.up.push((ctx.at = at));
                break;
              }
              if ('function' != typeof (data || '').toJSON) {
                add += '{';
                at = {
                  i: -1,
                  ok: Object.keys(data).sort(),
                  as: data,
                  up: at,
                  j: 0,
                };
                at.l = at.ok.length;
                ctx.up.push((ctx.at = at));
                break;
              }
              if ((tmp = data.toJSON())) {
                add += tmp;
                break;
              }
            // let this & below pass into default case...
            case 'function':
              if (at.as instanceof Array) {
                add += 'null';
                break;
              }
            default: // handle wrongly added leading `,` if previous item not JSON-able.
              add = '';
              at.j++;
          }
          ctx.text += add;
          while (1 + at.i >= at.l) {
            ctx.text += at.ok ? '}' : ']';
            at = ctx.at = at.up;
          }
          if (++at.i < at.l) {
            if ((tmp = at.ok)) {
              at.d = at.as[(at.k = tmp[at.i])];
            } else {
              at.d = at.as[at.i];
            }
            if (++j < 9) {
              return ify();
            } else {
              j = 0;
            }
            sI(ify);
            return;
          }
          ctx.done(u, ctx.text);
        }
      };
      if (typeof window != '' + u) {
        window.YSON = yson;
      }
      try {
        if ('object' != '' + u) {
          module.exports = yson;
        }
      } catch (e) {}
      if (typeof JSON != '' + u) {
        JSON.parseAsync = yson.parseAsync;
        JSON.stringifyAsync = yson.stringifyAsync;
      }
    })();
  })(yson);
  return yson.exports;
}

var radmigtmp;
var hasRequiredRadmigtmp;

function requireRadmigtmp() {
  if (hasRequiredRadmigtmp) return radmigtmp;
  hasRequiredRadmigtmp = 1;
  radmigtmp = function (r) {
    var Radix = requireRadix();
    r.find('a', function () {
      var l = [];
      Radix.map(r.list, function (v, f) {
        if (!(f.indexOf('%1B') + 1)) {
          return;
        }
        if (!v) {
          return;
        }
        l.push([f, v]);
      });
      if (l.length) {
        console.log(
          '\n! ! ! WARNING ! ! !\nRAD v0.2020.x has detected OLD v0.2019.x data & automatically migrating. Automatic migration will be turned OFF in future versions! If you are just developing/testing, we recommend you reset your data. Please contact us if you have any concerns.\nThis message should only log once.'
        );
      }
      var f, v;
      l.forEach(function (a) {
        f = a[0];
        v = a[1];
        r.list(decodeURIComponent(f), v);
        r.list(f, 0);
      });
      if (!f) {
        return;
      }
      r.find.bad(f);
    });
  };
  return radmigtmp;
}

var hasRequiredRadisk;

function requireRadisk() {
  if (hasRequiredRadisk) return radisk.exports;
  hasRequiredRadisk = 1;
  (function () {
    function Radisk(opt) {
      opt = opt || {};
      opt.log = opt.log || console.log;
      opt.file = String(opt.file || 'radata');
      var has = (Radisk.has || (Radisk.has = {}))[opt.file];
      if (has) {
        return has;
      }

      opt.max =
        opt.max || (opt.memory ? opt.memory * 999 * 999 : 300000000) * 0.3;
      opt.until = opt.until || opt.wait || 250;
      opt.batch = opt.batch || 10 * 1000;
      opt.chunk = opt.chunk || 1024 * 1024 * 1; // 1MB
      opt.code = opt.code || {};
      opt.code.from = opt.code.from || '!';
      opt.jsonify = true;

      function ename(t) {
        return encodeURIComponent(t).replace(/\*/g, '%2A');
      } // TODO: Hash this also, but allow migration!
      function atomic(v) {
        return u !== v && (!v || 'object' != typeof v);
      }
      var timediate = '' + u === typeof setTimeout ? setTimeout : setTimeout;
      var puff = setTimeout.turn || timediate,
        u;
      var map = Radix.object;
      var ST = 0;

      if (!opt.store) {
        return opt.log(
          'ERROR: Radisk needs `opt.store` interface with `{get: fn, put: fn (, list: fn)}`!'
        );
      }
      if (!opt.store.put) {
        return opt.log(
          'ERROR: Radisk needs `store.put` interface with `(file, data, cb)`!'
        );
      }
      if (!opt.store.get) {
        return opt.log(
          'ERROR: Radisk needs `store.get` interface with `(file, cb)`!'
        );
      }
      if (!opt.store.list);

      if ('' + u != typeof require) {
        requireYson();
      }
      var parse =
        JSON.parseAsync ||
        function (t, cb, r) {
          var u;
          try {
            cb(u, JSON.parse(t, r));
          } catch (e) {
            cb(e);
          }
        };
      /*
				Any and all storage adapters should...
				1. Because writing to disk takes time, we should batch data to disk. This improves performance, and reduces potential disk corruption.
				2. If a batch exceeds a certain number of writes, we should immediately write to disk when physically possible. This caps total performance, but reduces potential loss.
			*/
      var r = function (key, data, cb, tag, DBG) {
        if ('function' === typeof data) {
          var o = cb || {};
          cb = data;
          r.read(key, cb, o, DBG || tag);
          return;
        }
        //var tmp = (tmp = r.batch = r.batch || {})[key] = tmp[key] || {};
        //var tmp = (tmp = r.batch = r.batch || {})[key] = data;
        r.save(key, data, cb, tag, DBG);
      };
      r.save = function (key, data, cb, tag, DBG) {
        var s = { key: key },
          f,
          q;
        s.find = function (file) {
          var tmp;
          s.file = file || (file = opt.code.from);
          DBG && (DBG = DBG[file] = DBG[file] || {});
          DBG && (DBG.sf = DBG.sf || +new Date());
          //console.only.i && console.log('found', file);
          if ((tmp = r.disk[file])) {
            s.mix(u, tmp);
            return;
          }
          r.parse(file, s.mix, u, DBG);
        };
        s.mix = function (err, disk) {
          DBG && (DBG.sml = +new Date());
          DBG && (DBG.sm = DBG.sm || +new Date());
          if ((s.err = err || s.err)) {
            cb(err);
            return;
          } // TODO: HANDLE BATCH EMIT
          var file = (s.file = (disk || '').file || s.file),
            tmp;
          if (!disk && file !== opt.code.from) {
            // corrupt file?
            r.find.bad(file); // remove from dir list
            r.save(key, data, cb, tag); // try again
            return;
          }
          (disk = r.disk[file] || (r.disk[file] = disk || Radix())).file ||
            (disk.file = file);
          if (opt.compare) {
            data = opt.compare(disk(key), data, key, file);
            if (u === data) {
              cb(err, -1);
              return;
            } // TODO: HANDLE BATCH EMIT
          }
          (s.disk = disk)(key, data);
          if (tag) {
            (tmp =
              (tmp = disk.tags || (disk.tags = {}))[tag] ||
              (tmp[tag] = r.tags[tag] || (r.tags[tag] = {})))[file] ||
              (tmp[file] = r.one[tag] || (r.one[tag] = cb));
            cb = null;
          }
          DBG && (DBG.st = DBG.st || +new Date());
          //console.only.i && console.log('mix', disk.Q);
          if (disk.Q) {
            cb && disk.Q.push(cb);
            return;
          }
          disk.Q = cb ? [cb] : [];
          disk.to = setTimeout(s.write, opt.until);
        };
        s.write = function () {
          DBG && (DBG.sto = DBG.sto || +new Date());
          var file = (f = s.file),
            disk = s.disk;
          q = s.q = disk.Q;
          s.tags = disk.tags;
          delete disk.Q;
          delete r.disk[file];
          delete disk.tags;
          //console.only.i && console.log('write', file, disk, 'was saving:', key, data);
          r.write(file, disk, s.ack, u, DBG);
        };
        s.ack = function (err, ok) {
          DBG && (DBG.sa = DBG.sa || +new Date());
          DBG && (DBG.sal = q.length);
          var ack, tmp;
          // TODO!!!! CHANGE THIS INTO PUFF!!!!!!!!!!!!!!!!
          for (var id in r.tags) {
            if (!r.tags.hasOwnProperty(id)) {
              continue;
            }
            var tag = r.tags[id];
            if ((tmp = r.disk[f]) && (tmp = tmp.tags) && tmp[tag]) {
              continue;
            }
            ack = tag[f];
            delete tag[f];
            var ne;
            for (var k in tag) {
              if (tag.hasOwnProperty(k)) {
                ne = true;
                break;
              }
            } // is not empty?
            if (ne) {
              continue;
            } //if(!obj_empty(tag)){ continue }
            delete r.tags[tag];
            ack && ack(err, ok);
          }
          !q && (q = '');
          var l = q.length,
            i = 0;
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          // TODO: PERF: Why is acks so slow, what work do they do??? CHECK THIS!!
          var S = +new Date();
          for (; i < l; i++) {
            (ack = q[i]) && ack(err, ok);
          }
          console.STAT &&
            console.STAT(S, +new Date() - S, 'rad acks', ename(s.file));
          console.STAT &&
            console.STAT(S, q.length, 'rad acks #', ename(s.file));
        };
        cb ||
          (cb = function (err, ok) {
            // test delete!
            if (!err) {
              return;
            }
          });
        //console.only.i && console.log('save', key);
        r.find(key, s.find);
      };
      r.disk = {};
      r.one = {};
      r.tags = {};

      /*
				Any storage engine at some point will have to do a read in order to write.
				This is true of even systems that use an append only log, if they support updates.
				Therefore it is unavoidable that a read will have to happen,
				the question is just how long you delay it.
			*/
      var RWC = 0;
      r.write = function (file, rad, cb, o, DBG) {
        if (!rad) {
          cb('No radix!');
          return;
        }
        o = 'object' == typeof o ? o : { force: o };
        var f = function Fractal() {},
          a,
          b;
        f.text = '';
        f.file = file = rad.file || (rad.file = file);
        if (!file) {
          cb('What file?');
          return;
        }
        f.write = function () {
          var text = (rad.raw = f.text);
          r.disk[(file = rad.file || f.file || file)] = rad;
          var S = +new Date();
          DBG && (DBG.wd = S);
          //console.only.i && console.log('add', file);
          r.find.add(file, function add(err) {
            DBG && (DBG.wa = +new Date());
            if (err) {
              cb(err);
              return;
            }
            //console.only.i && console.log('disk', file, text);
            opt.store.put(ename(file), text, function safe(err, ok) {
              DBG && (DBG.wp = +new Date());
              console.STAT &&
                console.STAT(
                  S,
                  (ST = +new Date() - S),
                  'wrote disk',
                  JSON.stringify(file),
                  ++RWC,
                  'total all writes.'
                );
              //console.only.i && console.log('done', err, ok || 1, cb);
              cb(err, ok || 1);
              if (!rad.Q) {
                delete r.disk[file];
              } // VERY IMPORTANT! Clean up memory, but not if there is already queued writes on it!
            });
          });
        };
        f.split = function () {
          var S = +new Date();
          DBG && (DBG.wf = S);
          f.text = '';
          if (!f.count) {
            f.count = 0;
            Radix.map(rad, function count() {
              f.count++;
            }); // TODO: Perf? Any faster way to get total length?
          }
          DBG && (DBG.wfc = f.count);
          f.limit = Math.ceil(f.count / 2);
          var SC = f.count;
          f.count = 0;
          DBG && (DBG.wf1 = +new Date());
          f.sub = Radix();
          Radix.map(rad, f.slice, { reverse: 1 }); // IMPORTANT: DO THIS IN REVERSE, SO LAST HALF OF DATA MOVED TO NEW FILE BEFORE DROPPING FROM CURRENT FILE.
          DBG && (DBG.wf2 = +new Date());
          r.write(f.end, f.sub, f.both, o);
          DBG && (DBG.wf3 = +new Date());
          f.hub = Radix();
          Radix.map(rad, f.stop);
          DBG && (DBG.wf4 = +new Date());
          r.write(rad.file, f.hub, f.both, o);
          DBG && (DBG.wf5 = +new Date());
          console.STAT &&
            console.STAT(S, +new Date() - S, 'rad split', ename(rad.file), SC);
          return true;
        };
        f.slice = function (val, key) {
          f.sub((f.end = key), val);
          if (f.limit <= ++f.count) {
            return true;
          }
        };
        f.stop = function (val, key) {
          if (key >= f.end) {
            return true;
          }
          f.hub(key, val);
        };
        f.both = function (err, ok) {
          DBG && (DBG.wfd = +new Date());
          if (b) {
            cb(err || b);
            return;
          }
          if (a) {
            cb(err, ok);
            return;
          }
          a = true;
          b = err;
        };
        f.each = function (val, key, k, pre) {
          if (u !== val) {
            f.count++;
          }
          if (opt.max <= (val || '').length) {
            return cb('Data too big!'), true;
          }
          var enc =
            Radisk.encode(pre.length) +
            '#' +
            Radisk.encode(k) +
            (u === val ? '' : ':' + Radisk.encode(val)) +
            '\n';
          if (
            opt.chunk < f.text.length + enc.length &&
            1 < f.count &&
            !o.force
          ) {
            return f.split();
          }
          f.text += enc;
        };
        //console.only.i && console.log('writing');
        if (opt.jsonify) {
          r.write.jsonify(f, rad, cb, o, DBG);
          return;
        } // temporary testing idea
        if (!Radix.map(rad, f.each, true)) {
          f.write();
        }
      };

      r.write.jsonify = function (f, rad, cb, o, DBG) {
        var raw;
        var S = +new Date();
        DBG && (DBG.w = S);
        try {
          raw = JSON.stringify(rad.$);
        } catch (e) {
          cb('Cannot radisk!');
          return;
        }
        DBG && (DBG.ws = +new Date());
        console.STAT &&
          console.STAT(S, +new Date() - S, 'rad stringified JSON');
        if (opt.chunk < raw.length && !o.force) {
          var c = 0;
          Radix.map(rad, function () {
            if (c++) {
              return true;
            } // more than 1 item
          });
          if (c > 1) {
            return f.split();
          }
        }
        f.text = raw;
        f.write();
      };

      r.range = function (tree, o) {
        if (!tree || !o) {
          return;
        }
        if (u === o.start && u === o.end) {
          return tree;
        }
        if (atomic(tree)) {
          return tree;
        }
        var sub = Radix();
        Radix.map(
          tree,
          function (v, k) {
            sub(k, v);
          },
          o
        ); // ONLY PLACE THAT TAKES TREE, maybe reduce API for better perf?
        return sub('');
      };
      (function () {
        r.read = function (key, cb, o, DBG) {
          o = o || {};
          var g = { key: key };
          g.find = function (file) {
            var tmp;
            g.file = file || (file = opt.code.from);
            DBG && (DBG = DBG[file] = DBG[file] || {});
            DBG && (DBG.rf = DBG.rf || +new Date());
            if ((tmp = r.disk[(g.file = file)])) {
              g.check(u, tmp);
              return;
            }
            r.parse(file, g.check, u, DBG);
          };
          g.get = function (err, disk, info) {
            DBG && (DBG.rgl = +new Date());
            DBG && (DBG.rg = DBG.rg || +new Date());
            if ((g.err = err || g.err)) {
              cb(err);
              return;
            }
            var file = (g.file = (disk || '').file || g.file);
            if (!disk && file !== opt.code.from) {
              // corrupt file?
              r.find.bad(file); // remove from dir list
              r.read(key, cb, o); // try again
              return;
            }
            disk = r.disk[file] || (r.disk[file] = disk);
            if (!disk) {
              cb(file === opt.code.from ? u : 'No file!');
              return;
            }
            disk.file || (disk.file = file);
            var data = r.range(disk(key), o);
            DBG && (DBG.rr = +new Date());
            o.unit = disk.unit;
            o.chunks = (o.chunks || 0) + 1;
            o.parsed =
              (o.parsed || 0) + ((info || '').parsed || o.chunks * opt.chunk);
            o.more = 1;
            o.next = u;
            Radix.map(
              r.list,
              function next(v, f) {
                if (!v || file === f) {
                  return;
                }
                o.next = f;
                return 1;
              },
              o.reverse ? { reverse: 1, end: file } : { start: file }
            );
            DBG && (DBG.rl = +new Date());
            if (!o.next) {
              o.more = 0;
            }
            if (o.next) {
              if (
                !o.reverse &&
                ((key < o.next && 0 != o.next.indexOf(key)) ||
                  (u !== o.end && (o.end || '\uffff') < o.next))
              ) {
                o.more = 0;
              }
              if (
                o.reverse &&
                ((key > o.next && 0 != key.indexOf(o.next)) ||
                  (u !== o.start &&
                    (o.start || '') > o.next &&
                    file <= o.start))
              ) {
                o.more = 0;
              }
            }
            //console.log(5, process.memoryUsage().heapUsed);
            if (!o.more) {
              cb(g.err, data, o);
              return;
            }
            if (data) {
              cb(g.err, data, o);
            }
            if (o.parsed >= o.limit) {
              return;
            }
            var S = +new Date();
            DBG && (DBG.rm = S);
            var next = o.next;
            timediate(function () {
              console.STAT && console.STAT(S, +new Date() - S, 'rad more');
              r.parse(next, g.check);
            }, 0);
          };
          g.check = function (err, disk, info) {
            //console.log(4, process.memoryUsage().heapUsed);
            g.get(err, disk, info);
            if (!disk || disk.check) {
              return;
            }
            disk.check = 1;
            var S = +new Date();
            (info || (info = {})).file || (info.file = g.file);
            Radix.map(disk, function (val, key) {
              // assume in memory for now, since both write/read already call r.find which will init it.
              r.find(key, function (file) {
                if ((file || (file = opt.code.from)) === info.file) {
                  return;
                }
                var id = ('' + Math.random()).slice(-3);
                puff(function () {
                  r.save(key, val, function ack(err, ok) {
                    if (err) {
                      r.save(key, val, ack);
                      return;
                    } // ad infinitum???
                    // TODO: NOTE!!! Mislocated data could be because of a synchronous `put` from the `g.get(` other than perf shouldn't we do the check first before acking?
                    console.STAT &&
                      console.STAT(
                        'MISLOCATED DATA CORRECTED',
                        id,
                        ename(key),
                        ename(info.file),
                        ename(file)
                      );
                  });
                }, 0);
              });
            });
            console.STAT && console.STAT(S, +new Date() - S, 'rad check');
          };
          r.find(key || (o.reverse ? o.end || '' : o.start || ''), g.find);
        };
      })();
      (function () {
        /*
					Let us start by assuming we are the only process that is
					changing the directory or bucket. Not because we do not want
					to be multi-process/machine, but because we want to experiment
					with how much performance and scale we can get out of only one.
					Then we can work on the harder problem of being multi-process.
				*/
        var RPC = 0;
        var Q = {},
          s = String.fromCharCode(31);
        r.parse = function (file, cb, raw, DBG) {
          var q;
          if (!file) {
            return cb();
          }
          if ((q = Q[file])) {
            q.push(cb);
            return;
          }
          q = Q[file] = [cb];
          var p = function Parse() {},
            info = { file: file };
          (p.disk = Radix()).file = file;
          p.read = function (err, data) {
            DBG && (DBG.rpg = +new Date());
            console.STAT &&
              console.STAT(
                S,
                +new Date() - S,
                'read disk',
                JSON.stringify(file),
                ++RPC,
                'total all parses.'
              );
            //console.log(2, process.memoryUsage().heapUsed);
            if ((p.err = err) || (p.not = !data)) {
              delete Q[file];
              p.map(q, p.ack);
              return;
            }
            if ('string' !== typeof data) {
              try {
                if (opt.max <= data.length) {
                  p.err = 'Chunk too big!';
                } else {
                  data = data.toString(); // If it crashes, it crashes here. How!?? We check size first!
                }
              } catch (e) {
                p.err = e;
              }
              if (p.err) {
                delete Q[file];
                p.map(q, p.ack);
                return;
              }
            }
            info.parsed = data.length;
            DBG && (DBG.rpl = info.parsed);
            DBG && (DBG.rpa = q.length);
            S = +new Date();
            if (!(opt.jsonify || '{' === data[0])) {
              p.radec(err, data);
              return;
            }
            parse(data, function (err, tree) {
              //console.log(3, process.memoryUsage().heapUsed);
              if (!err) {
                delete Q[file];
                p.disk.$ = tree;
                console.STAT &&
                  (ST = +new Date() - S) > 9 &&
                  console.STAT(S, ST, 'rad parsed JSON');
                DBG && (DBG.rpd = +new Date());
                p.map(q, p.ack); // hmmm, v8 profiler can't see into this cause of try/catch?
                return;
              }
              if ('{' === data[0]) {
                delete Q[file];
                p.err = 'JSON error!';
                p.map(q, p.ack);
                return;
              }
              p.radec(err, data);
            });
          };
          p.map = function () {
            // switch to setTimeout.each now?
            if (!q || !q.length) {
              return;
            }
            //var i = 0, l = q.length, ack;
            var S = +new Date();
            var err = p.err,
              data = p.not ? u : p.disk;
            var i = 0,
              ack;
            while (i < 9 && (ack = q[i++])) {
              ack(err, data, info);
            } // too much?
            console.STAT &&
              console.STAT(S, +new Date() - S, 'rad packs', ename(file));
            console.STAT && console.STAT(S, i, 'rad packs #', ename(file));
            if (!(q = q.slice(i)).length) {
              return;
            }
            puff(p.map, 0);
          };
          p.ack = function (cb) {
            if (!cb) {
              return;
            }
            if (p.err || p.not) {
              cb(p.err, u, info);
              return;
            }
            cb(u, p.disk, info);
          };
          p.radec = function (err, data) {
            delete Q[file];
            S = +new Date();
            var tmp = p.split(data),
              pre = [],
              i,
              k,
              v;
            if (!tmp || 0 !== tmp[1]) {
              p.err = "File '" + file + "' does not have root radix! ";
              p.map(q, p.ack);
              return;
            }
            while (tmp) {
              k = v = u;
              i = tmp[1];
              tmp = p.split(tmp[2]) || '';
              if ('#' == tmp[0]) {
                k = tmp[1];
                pre = pre.slice(0, i);
                if (i <= pre.length) {
                  pre.push(k);
                }
              }
              tmp = p.split(tmp[2]) || '';
              if ('\n' == tmp[0]) {
                continue;
              }
              if ('=' == tmp[0] || ':' == tmp[0]) {
                v = tmp[1];
              }
              if (u !== k && u !== v) {
                p.disk(pre.join(''), v);
              }
              tmp = p.split(tmp[2]);
            }
            console.STAT && console.STAT(S, +new Date() - S, 'parsed RAD');
            p.map(q, p.ack);
          };
          p.split = function (t) {
            if (!t) {
              return;
            }
            var l = [],
              o = {},
              i = -1,
              a = '';
            i = t.indexOf(s);
            if (!t[i]) {
              return;
            }
            a = t.slice(0, i);
            l[0] = a;
            l[1] = Radisk.decode(t.slice(i), o);
            l[2] = t.slice(i + o.i);
            return l;
          };
          if (r.disk) {
            raw || (raw = (r.disk[file] || '').raw);
          }
          var S = +new Date();
          DBG && (DBG.rp = S);
          if (raw) {
            return puff(function () {
              p.read(u, raw);
            }, 0);
          }
          opt.store.get(ename(file), p.read);
          // TODO: What if memory disk gets filled with updates, and we get an old one back?
        };
      })();
      (function () {
        var dir,
          f = String.fromCharCode(28),
          Q;
        r.find = function (key, cb) {
          if (!dir) {
            if (Q) {
              Q.push([key, cb]);
              return;
            }
            Q = [[key, cb]];
            r.parse(f, init);
            return;
          }
          Radix.map(
            (r.list = dir),
            function (val, key) {
              if (!val) {
                return;
              }
              return cb(key) || true;
            },
            { reverse: 1, end: key }
          ) || cb(opt.code.from);
        };
        r.find.add = function (file, cb) {
          var has = dir(file);
          if (has || file === f) {
            cb(u, 1);
            return;
          }
          dir(file, 1);
          cb.found = (cb.found || 0) + 1;
          r.write(
            f,
            dir,
            function (err, ok) {
              if (err) {
                cb(err);
                return;
              }
              cb.found = (cb.found || 0) - 1;
              if (0 !== cb.found) {
                return;
              }
              cb(u, 1);
            },
            true
          );
        };
        r.find.bad = function (file, cb) {
          dir(file, 0);
          r.write(f, dir, cb || noop);
        };
        function init(err, disk) {
          if (err) {
            opt.log('list', err);
            setTimeout(function () {
              r.parse(f, init);
            }, 1000);
            return;
          }
          if (disk) {
            drain(disk);
            return;
          }
          dir = dir || disk || Radix();
          if (!opt.store.list) {
            drain(dir);
            return;
          }
          // import directory.
          opt.store.list(function (file) {
            if (!file) {
              drain(dir);
              return;
            }
            r.find.add(file, noop);
          });
        }
        function drain(rad, tmp) {
          dir = dir || rad;
          dir.file = f;
          tmp = Q;
          Q = null;
          map(tmp, function (arg) {
            r.find(arg[0], arg[1]);
          });
        }
      })();

      try {
        !Gun.window && requireRadmigtmp()(r);
      } catch (e) {}

      var noop = function () {},
        u;
      Radisk.has[opt.file] = r;
      return r;
    }
    (function () {
      var _ = String.fromCharCode(31);
      Radisk.encode = function (d, o, s) {
        s = s || _;
        var t = s,
          tmp;
        if (typeof d == 'string') {
          var i = d.indexOf(s);
          while (i != -1) {
            t += s;
            i = d.indexOf(s, i + 1);
          }
          return t + '"' + d + s;
        } else if (d && d['#'] && 1 == Object.keys(d).length) {
          return t + '#' + tmp + t;
        } else if ('number' == typeof d) {
          return t + '+' + (d || 0) + t;
        } else if (null === d) {
          return t + ' ' + t;
        } else if (true === d) {
          return t + '+' + t;
        } else if (false === d) {
          return t + '-' + t;
        } // else
        //if(binary){}
      };
      Radisk.decode = function (t, o, s) {
        s = s || _;
        var d = '',
          i = -1,
          n = 0,
          c,
          p;
        if (s !== t[0]) {
          return;
        }
        while (s === t[++i]) {
          ++n;
        }
        p = t[(c = n)] || true;
        while (--n >= 0) {
          i = t.indexOf(s, i + 1);
        }
        if (i == -1) {
          i = t.length;
        }
        d = t.slice(c + 1, i);
        if (o) {
          o.i = i + 1;
        }
        if ('"' === p) {
          return d;
        } else if ('#' === p) {
          return { '#': d };
        } else if ('+' === p) {
          if (0 === d.length) {
            return true;
          }
          return parseFloat(d);
        } else if (' ' === p) {
          return null;
        } else if ('-' === p) {
          return false;
        }
      };
    })();

    if (typeof window !== 'undefined') {
      var Gun = window.Gun;
      var Radix = window.Radix;
      window.Radisk = Radisk;
    } else {
      var Gun = requireGun();
      var Radix = requireRadix();
      //var Radix = require('./radix2'); Radisk = require('./radisk2');
      try {
        radisk.exports = Radisk;
      } catch (e) {}
    }

    Radisk.Radix = Radix;
  })();
  return radisk.exports;
}

requireRadisk();

var store = {};

var hasRequiredStore;

function requireStore() {
  if (hasRequiredStore) return store;
  hasRequiredStore = 1;
  var Gun = typeof window !== 'undefined' ? window.Gun : requireGun();

  Gun.on('create', function (root) {
    if (Gun.TESTING) {
      root.opt.file = 'radatatest';
    }
    this.to.next(root);
    var opt = root.opt,
      u;
    if (false === opt.rad || false === opt.radisk) {
      return;
    }
    if (u + '' != typeof process && 'false' === '' + (process.env || '').RAD) {
      return;
    }
    var Radisk = (Gun.window && Gun.window.Radisk) || requireRadisk();
    var Radix = Radisk.Radix;
    var dare = Radisk(opt),
      esc = String.fromCharCode(27);
    var ST = 0;

    root.on('put', function (msg) {
      this.to.next(msg);
      if ((msg._ || '').rad) {
        return;
      } // don't save what just came from a read.
      //if(msg['@']){ return } // WHY DID I NOT ADD THIS?
      var id = msg['#'],
        put = msg.put,
        soul = put['#'],
        key = put['.'],
        val = put[':'],
        state = put['>'];
      var DBG = (msg._ || '').DBG;
      DBG && (DBG.sp = DBG.sp || +new Date());
      //var lot = (msg._||'').lot||''; count[id] = (count[id] || 0) + 1;
      var S = (msg._ || '').RPS || ((msg._ || '').RPS = +new Date());
      //console.log("PUT ------->>>", soul,key, val, state);
      //dare(soul+esc+key, {':': val, '>': state}, dare.one[id] || function(err, ok){
      dare(
        soul + esc + key,
        { ':': val, '>': state },
        function (err, ok) {
          //console.log("<<<------- PAT", soul,key, val, state, 'in', +new Date - S);
          DBG && (DBG.spd = DBG.spd || +new Date());
          console.STAT && console.STAT(S, +new Date() - S, 'put');
          //if(!err && count[id] !== lot.s){ console.log(err = "Disk count not same as ram count."); console.STAT && console.STAT(+new Date, lot.s - count[id], 'put ack != count') } delete count[id];
          if (err) {
            root.on('in', { '@': id, err: err, DBG: DBG });
            return;
          }
          root.on('in', { '@': id, ok: ok, DBG: DBG });
          //}, id, DBG && (DBG.r = DBG.r || {}));
        },
        false,
        DBG && (DBG.r = DBG.r || {})
      );
      DBG && (DBG.sps = DBG.sps || +new Date());
    });

    root.on('get', function (msg) {
      this.to.next(msg);
      var ctx = msg._ || '',
        DBG = (ctx.DBG = msg.DBG);
      DBG && (DBG.sg = +new Date());
      var id = msg['#'],
        get = msg.get,
        soul = msg.get['#'],
        has = msg.get['.'] || '',
        o = {},
        graph,
        key,
        tmp,
        force;
      if ('string' == typeof soul) {
        key = soul;
      } else if (soul) {
        if (u !== (tmp = soul['*'])) {
          o.limit = force = 1;
        }
        if (u !== soul['>']) {
          o.start = soul['>'];
        }
        if (u !== soul['<']) {
          o.end = soul['<'];
        }
        key = force ? '' + tmp : tmp || soul['='];
        force = null;
      }
      if (key && !o.limit) {
        // a soul.has must be on a soul, and not during soul*
        if ('string' == typeof has) {
          key = key + esc + (o.atom = has);
        } else if (has) {
          if (u !== has['>']) {
            o.start = has['>'];
            o.limit = 1;
          }
          if (u !== has['<']) {
            o.end = has['<'];
            o.limit = 1;
          }
          if (u !== (tmp = has['*'])) {
            o.limit = force = 1;
          }
          if (key) {
            key =
              key +
              esc +
              (force ? '' + (tmp || '') : tmp || (o.atom = has['='] || ''));
          }
        }
      }
      if ((tmp = get['%']) || o.limit) {
        o.limit = tmp <= (o.pack || 1000 * 100) ? tmp : 1;
      }
      if (has['-'] || (soul || {})['-'] || get['-']) {
        o.reverse = true;
      }
      if ((tmp = (root.next || '')[soul]) && tmp.put) {
        if (o.atom) {
          tmp = (tmp.next || '')[o.atom];
          if (
            tmp &&
            tmp.root &&
            tmp.root.graph &&
            tmp.root.graph[soul] &&
            tmp.root.graph[soul][o.atom]
          ) {
            return;
          }
        } else if (tmp && tmp.rad) {
          return;
        }
      }
      var now = Gun.state();
      var S = +new Date(),
        C = 0; // STATS!
      DBG && (DBG.sgm = S);
      //var GID = String.random(3); console.log("GET ------->>>", GID, key, o, '?', get);
      dare(
        key || '',
        function (err, data, info) {
          //console.log("<<<------- GOT", GID, +new Date - S, err, data);
          DBG && (DBG.sgr = +new Date());
          DBG && (DBG.sgi = info);
          try {
            opt.store.stats.get.time[statg % 50] = +new Date() - S;
            ++statg;
            opt.store.stats.get.count++;
            if (err) {
              opt.store.stats.get.err = err;
            }
          } catch (e) {} // STATS!
          //if(u === data && info.chunks > 1){ return } // if we already sent a chunk, ignore ending empty responses. // this causes tests to fail.
          console.STAT &&
            console.STAT(S, +new Date() - S, 'got', JSON.stringify(key));
          S = +new Date();
          info = info || '';
          var va, ve;
          if (
            info.unit &&
            data &&
            u !== (va = data[':']) &&
            u !== (ve = data['>'])
          ) {
            // new format
            var tmp = key.split(esc),
              so = tmp[0],
              ha = tmp[1];
            (graph = graph || {})[so] = Gun.state.ify(
              graph[so],
              ha,
              ve,
              va,
              so
            );
            root.$.get(so).get(ha)._.rad = now;
            // REMEMBER TO ADD _rad TO NODE/SOUL QUERY!
          } else if (data) {
            // old code path
            if (typeof data !== 'string') {
              if (o.atom) {
                data = u;
              } else {
                Radix.map(data, each, o); // IS A RADIX TREE, NOT FUNCTION!
              }
            }
            if (!graph && data) {
              each(data, '');
            }
            // TODO: !has what about soul lookups?
            if (
              !o.atom &&
              !has & ('string' == typeof soul) &&
              !o.limit &&
              !o.more
            ) {
              root.$.get(soul)._.rad = now;
            }
          }
          DBG && (DBG.sgp = +new Date());
          // TODO: PERF NOTES! This is like 0.2s, but for each ack, or all? Can you cache these preps?
          // TODO: PERF NOTES! This is like 0.2s, but for each ack, or all? Can you cache these preps?
          // TODO: PERF NOTES! This is like 0.2s, but for each ack, or all? Can you cache these preps?
          // TODO: PERF NOTES! This is like 0.2s, but for each ack, or all? Can you cache these preps?
          // TODO: PERF NOTES! This is like 0.2s, but for each ack, or all? Can you cache these preps?
          // Or benchmark by reusing first start date.
          if (console.STAT && (ST = +new Date() - S) > 9) {
            console.STAT(S, ST, 'got prep time');
            console.STAT(S, C, 'got prep #');
          }
          C = 0;
          S = +new Date();
          var faith = function () {};
          faith.faith = true;
          faith.rad = get; // HNPERF: We're testing performance improvement by skipping going through security again, but this should be audited.
          root.on('in', {
            '@': id,
            put: graph,
            '%': info.more ? 1 : u,
            err: err ? err : u,
            _: faith,
            DBG: DBG,
          });
          console.STAT &&
            (ST = +new Date() - S) > 9 &&
            console.STAT(S, ST, 'got emit', Object.keys(graph || {}).length);
          graph = u; // each is outside our scope, we have to reset graph to nothing!
        },
        o,
        DBG && (DBG.r = DBG.r || {})
      );
      DBG && (DBG.sgd = +new Date());
      console.STAT &&
        (ST = +new Date() - S) > 9 &&
        console.STAT(S, ST, 'get call'); // TODO: Perf: this was half a second??????
      function each(val, has, a, b) {
        // TODO: THIS CODE NEEDS TO BE FASTER!!!!
        C++;
        if (!val) {
          return;
        }
        has = (key + has).split(esc);
        var soul = has.slice(0, 1)[0];
        has = has.slice(-1)[0];
        if (o.limit && o.limit <= o.count) {
          return true;
        }
        var va,
          ve,
          so = soul,
          ha = has;
        //if(u !== (va = val[':']) && u !== (ve = val['>'])){ // THIS HANDLES NEW CODE!
        if ('string' != typeof val) {
          // THIS HANDLES NEW CODE!
          va = val[':'];
          ve = val['>'];
          (graph = graph || {})[so] = Gun.state.ify(graph[so], ha, ve, va, so);
          //root.$.get(so).get(ha)._.rad = now;
          o.count = (o.count || 0) + ((va || '').length || 9);
          return;
        }
        o.count = (o.count || 0) + val.length;
        var tmp = val.lastIndexOf('>');
        var state = Radisk.decode(val.slice(tmp + 1), null, esc);
        val = Radisk.decode(val.slice(0, tmp), null, esc);
        (graph = graph || {})[soul] = Gun.state.ify(
          graph[soul],
          has,
          state,
          val,
          soul
        );
      }
    });
    Gun.valid;
    (opt.store || {}).stats = {
      get: { time: {}, count: 0 },
      put: { time: {}, count: 0 },
    }; // STATS!
    var statg = 0; // STATS!
  });
  return store;
}

requireStore();

var rindexed = { exports: {} };

var hasRequiredRindexed;

function requireRindexed() {
  if (hasRequiredRindexed) return rindexed.exports;
  hasRequiredRindexed = 1;
  (function () {
    /* // from @jabis
	if (navigator.storage && navigator.storage.estimate) {
	  const quota = await navigator.storage.estimate();
	  // quota.usage -> Number of bytes used.
	  // quota.quota -> Maximum number of bytes available.
	  const percentageUsed = (quota.usage / quota.quota) * 100;
	  console.log(`You've used ${percentageUsed}% of the available storage.`);
	  const remaining = quota.quota - quota.usage;
	  console.log(`You can write up to ${remaining} more bytes.`);
	}
	*/
    function Store(opt) {
      opt = opt || {};
      opt.file = String(opt.file || 'radata');
      var store = Store[opt.file],
        db = null,
        u;

      if (store) {
        console.log(
          'Warning: reusing same IndexedDB store and options as 1st.'
        );
        return Store[opt.file];
      }
      store = Store[opt.file] = function () {};

      try {
        opt.indexedDB = opt.indexedDB || Store.indexedDB || indexedDB;
      } catch (e) {}
      try {
        if (!opt.indexedDB || 'file:' == location.protocol) {
          var s = store.d || (store.d = {});
          store.put = function (f, d, cb) {
            s[f] = d;
            setTimeout(function () {
              cb(null, 1);
            }, 250);
          };
          store.get = function (f, cb) {
            setTimeout(function () {
              cb(null, s[f] || u);
            }, 5);
          };
          console.log('Warning: No indexedDB exists to persist data to!');
          return store;
        }
      } catch (e) {}

      store.start = function () {
        var o = indexedDB.open(opt.file, 1);
        o.onupgradeneeded = function (eve) {
          eve.target.result.createObjectStore(opt.file);
        };
        o.onsuccess = function () {
          db = o.result;
        };
        o.onerror = function (eve) {
          console.log(eve || 1);
        };
      };
      store.start();

      store.put = function (key, data, cb) {
        if (!db) {
          setTimeout(function () {
            store.put(key, data, cb);
          }, 1);
          return;
        }
        var tx = db.transaction([opt.file], 'readwrite');
        var obj = tx.objectStore(opt.file);
        var req = obj.put(data, '' + key);
        req.onsuccess =
          obj.onsuccess =
          tx.onsuccess =
            function () {
              cb(null, 1);
            };
        req.onabort =
          obj.onabort =
          tx.onabort =
            function (eve) {
              cb(eve || 'put.tx.abort');
            };
        req.onerror =
          obj.onerror =
          tx.onerror =
            function (eve) {
              cb(eve || 'put.tx.error');
            };
      };

      store.get = function (key, cb) {
        if (!db) {
          setTimeout(function () {
            store.get(key, cb);
          }, 9);
          return;
        }
        var tx = db.transaction([opt.file], 'readonly');
        var obj = tx.objectStore(opt.file);
        var req = obj.get('' + key);
        req.onsuccess = function () {
          cb(null, req.result);
        };
        req.onabort = function (eve) {
          cb(eve || 4);
        };
        req.onerror = function (eve) {
          cb(eve || 5);
        };
      };
      setInterval(function () {
        db && db.close();
        db = null;
        store.start();
      }, 1000 * 15); // reset webkit bug?
      return store;
    }

    if (typeof window !== 'undefined') {
      (Store.window = window).RindexedDB = Store;
      Store.indexedDB = window.indexedDB; // safari bug
    } else {
      try {
        rindexed.exports = Store;
      } catch (e) {}
    }

    try {
      var Gun = Store.window.Gun || requireGun();
      Gun.on('create', function (root) {
        this.to.next(root);
        root.opt.store = root.opt.store || Store(root.opt);
      });
    } catch (e) {}
  })();
  return rindexed.exports;
}

requireRindexed();

var cryptoJs$1 = { exports: {} };

var core$1 = { exports: {} };

var core = core$1.exports;

var hasRequiredCore;

function requireCore() {
  if (hasRequiredCore) return core$1.exports;
  hasRequiredCore = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory();
      }
    })(core, function () {
      /*globals window, global, require*/

      /**
       * CryptoJS core components.
       */
      var CryptoJS =
        CryptoJS ||
        (function (Math, undefined$1) {
          var crypto;

          // Native crypto from window (Browser)
          if (typeof window !== 'undefined' && window.crypto) {
            crypto = window.crypto;
          }

          // Native crypto in web worker (Browser)
          if (typeof self !== 'undefined' && self.crypto) {
            crypto = self.crypto;
          }

          // Native crypto from worker
          if (typeof globalThis !== 'undefined' && globalThis.crypto) {
            crypto = globalThis.crypto;
          }

          // Native (experimental IE 11) crypto from window (Browser)
          if (!crypto && typeof window !== 'undefined' && window.msCrypto) {
            crypto = window.msCrypto;
          }

          // Native crypto from global (NodeJS)
          if (
            !crypto &&
            typeof commonjsGlobal !== 'undefined' &&
            commonjsGlobal.crypto
          ) {
            crypto = commonjsGlobal.crypto;
          }

          // Native crypto import via require (NodeJS)
          if (!crypto && typeof require === 'function') {
            try {
              crypto = require('crypto');
            } catch (err) {}
          }

          /*
           * Cryptographically secure pseudorandom number generator
           *
           * As Math.random() is cryptographically not safe to use
           */
          var cryptoSecureRandomInt = function () {
            if (crypto) {
              // Use getRandomValues method (Browser)
              if (typeof crypto.getRandomValues === 'function') {
                try {
                  return crypto.getRandomValues(new Uint32Array(1))[0];
                } catch (err) {}
              }

              // Use randomBytes method (NodeJS)
              if (typeof crypto.randomBytes === 'function') {
                try {
                  return crypto.randomBytes(4).readInt32LE();
                } catch (err) {}
              }
            }

            throw new Error(
              'Native crypto module could not be used to get secure random number.'
            );
          };

          /*
			     * Local polyfill of Object.create

			     */
          var create =
            Object.create ||
            (function () {
              function F() {}

              return function (obj) {
                var subtype;

                F.prototype = obj;

                subtype = new F();

                F.prototype = null;

                return subtype;
              };
            })();

          /**
           * CryptoJS namespace.
           */
          var C = {};

          /**
           * Library namespace.
           */
          var C_lib = (C.lib = {});

          /**
           * Base object for prototypal inheritance.
           */
          var Base = (C_lib.Base = (function () {
            return {
              /**
               * Creates a new object that inherits from this object.
               *
               * @param {Object} overrides Properties to copy into the new object.
               *
               * @return {Object} The new object.
               *
               * @static
               *
               * @example
               *
               *     var MyType = CryptoJS.lib.Base.extend({
               *         field: 'value',
               *
               *         method: function () {
               *         }
               *     });
               */
              extend: function (overrides) {
                // Spawn
                var subtype = create(this);

                // Augment
                if (overrides) {
                  subtype.mixIn(overrides);
                }

                // Create default initializer
                if (
                  !subtype.hasOwnProperty('init') ||
                  this.init === subtype.init
                ) {
                  subtype.init = function () {
                    subtype.$super.init.apply(this, arguments);
                  };
                }

                // Initializer's prototype is the subtype object
                subtype.init.prototype = subtype;

                // Reference supertype
                subtype.$super = this;

                return subtype;
              },

              /**
               * Extends this object and runs the init method.
               * Arguments to create() will be passed to init().
               *
               * @return {Object} The new object.
               *
               * @static
               *
               * @example
               *
               *     var instance = MyType.create();
               */
              create: function () {
                var instance = this.extend();
                instance.init.apply(instance, arguments);

                return instance;
              },

              /**
               * Initializes a newly created object.
               * Override this method to add some logic when your objects are created.
               *
               * @example
               *
               *     var MyType = CryptoJS.lib.Base.extend({
               *         init: function () {
               *             // ...
               *         }
               *     });
               */
              init: function () {},

              /**
               * Copies properties into this object.
               *
               * @param {Object} properties The properties to mix in.
               *
               * @example
               *
               *     MyType.mixIn({
               *         field: 'value'
               *     });
               */
              mixIn: function (properties) {
                for (var propertyName in properties) {
                  if (properties.hasOwnProperty(propertyName)) {
                    this[propertyName] = properties[propertyName];
                  }
                }

                // IE won't copy toString using the loop above
                if (properties.hasOwnProperty('toString')) {
                  this.toString = properties.toString;
                }
              },

              /**
               * Creates a copy of this object.
               *
               * @return {Object} The clone.
               *
               * @example
               *
               *     var clone = instance.clone();
               */
              clone: function () {
                return this.init.prototype.extend(this);
              },
            };
          })());

          /**
           * An array of 32-bit words.
           *
           * @property {Array} words The array of 32-bit words.
           * @property {number} sigBytes The number of significant bytes in this word array.
           */
          var WordArray = (C_lib.WordArray = Base.extend({
            /**
             * Initializes a newly created word array.
             *
             * @param {Array} words (Optional) An array of 32-bit words.
             * @param {number} sigBytes (Optional) The number of significant bytes in the words.
             *
             * @example
             *
             *     var wordArray = CryptoJS.lib.WordArray.create();
             *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
             *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
             */
            init: function (words, sigBytes) {
              words = this.words = words || [];

              if (sigBytes != undefined$1) {
                this.sigBytes = sigBytes;
              } else {
                this.sigBytes = words.length * 4;
              }
            },

            /**
             * Converts this word array to a string.
             *
             * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
             *
             * @return {string} The stringified word array.
             *
             * @example
             *
             *     var string = wordArray + '';
             *     var string = wordArray.toString();
             *     var string = wordArray.toString(CryptoJS.enc.Utf8);
             */
            toString: function (encoder) {
              return (encoder || Hex).stringify(this);
            },

            /**
             * Concatenates a word array to this word array.
             *
             * @param {WordArray} wordArray The word array to append.
             *
             * @return {WordArray} This word array.
             *
             * @example
             *
             *     wordArray1.concat(wordArray2);
             */
            concat: function (wordArray) {
              // Shortcuts
              var thisWords = this.words;
              var thatWords = wordArray.words;
              var thisSigBytes = this.sigBytes;
              var thatSigBytes = wordArray.sigBytes;

              // Clamp excess bits
              this.clamp();

              // Concat
              if (thisSigBytes % 4) {
                // Copy one byte at a time
                for (var i = 0; i < thatSigBytes; i++) {
                  var thatByte =
                    (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                  thisWords[(thisSigBytes + i) >>> 2] |=
                    thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                }
              } else {
                // Copy one word at a time
                for (var j = 0; j < thatSigBytes; j += 4) {
                  thisWords[(thisSigBytes + j) >>> 2] = thatWords[j >>> 2];
                }
              }
              this.sigBytes += thatSigBytes;

              // Chainable
              return this;
            },

            /**
             * Removes insignificant bits.
             *
             * @example
             *
             *     wordArray.clamp();
             */
            clamp: function () {
              // Shortcuts
              var words = this.words;
              var sigBytes = this.sigBytes;

              // Clamp
              words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
              words.length = Math.ceil(sigBytes / 4);
            },

            /**
             * Creates a copy of this word array.
             *
             * @return {WordArray} The clone.
             *
             * @example
             *
             *     var clone = wordArray.clone();
             */
            clone: function () {
              var clone = Base.clone.call(this);
              clone.words = this.words.slice(0);

              return clone;
            },

            /**
             * Creates a word array filled with random bytes.
             *
             * @param {number} nBytes The number of random bytes to generate.
             *
             * @return {WordArray} The random word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.lib.WordArray.random(16);
             */
            random: function (nBytes) {
              var words = [];

              for (var i = 0; i < nBytes; i += 4) {
                words.push(cryptoSecureRandomInt());
              }

              return new WordArray.init(words, nBytes);
            },
          }));

          /**
           * Encoder namespace.
           */
          var C_enc = (C.enc = {});

          /**
           * Hex encoding strategy.
           */
          var Hex = (C_enc.Hex = {
            /**
             * Converts a word array to a hex string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The hex string.
             *
             * @static
             *
             * @example
             *
             *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
             */
            stringify: function (wordArray) {
              // Shortcuts
              var words = wordArray.words;
              var sigBytes = wordArray.sigBytes;

              // Convert
              var hexChars = [];
              for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 0x0f).toString(16));
              }

              return hexChars.join('');
            },

            /**
             * Converts a hex string to a word array.
             *
             * @param {string} hexStr The hex string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
             */
            parse: function (hexStr) {
              // Shortcut
              var hexStrLength = hexStr.length;

              // Convert
              var words = [];
              for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |=
                  parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
              }

              return new WordArray.init(words, hexStrLength / 2);
            },
          });

          /**
           * Latin1 encoding strategy.
           */
          var Latin1 = (C_enc.Latin1 = {
            /**
             * Converts a word array to a Latin1 string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The Latin1 string.
             *
             * @static
             *
             * @example
             *
             *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
             */
            stringify: function (wordArray) {
              // Shortcuts
              var words = wordArray.words;
              var sigBytes = wordArray.sigBytes;

              // Convert
              var latin1Chars = [];
              for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                latin1Chars.push(String.fromCharCode(bite));
              }

              return latin1Chars.join('');
            },

            /**
             * Converts a Latin1 string to a word array.
             *
             * @param {string} latin1Str The Latin1 string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
             */
            parse: function (latin1Str) {
              // Shortcut
              var latin1StrLength = latin1Str.length;

              // Convert
              var words = [];
              for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |=
                  (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
              }

              return new WordArray.init(words, latin1StrLength);
            },
          });

          /**
           * UTF-8 encoding strategy.
           */
          var Utf8 = (C_enc.Utf8 = {
            /**
             * Converts a word array to a UTF-8 string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The UTF-8 string.
             *
             * @static
             *
             * @example
             *
             *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
             */
            stringify: function (wordArray) {
              try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
              } catch (e) {
                throw new Error('Malformed UTF-8 data');
              }
            },

            /**
             * Converts a UTF-8 string to a word array.
             *
             * @param {string} utf8Str The UTF-8 string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
             */
            parse: function (utf8Str) {
              return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
            },
          });

          /**
           * Abstract buffered block algorithm template.
           *
           * The property blockSize must be implemented in a concrete subtype.
           *
           * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
           */
          var BufferedBlockAlgorithm = (C_lib.BufferedBlockAlgorithm =
            Base.extend({
              /**
               * Resets this block algorithm's data buffer to its initial state.
               *
               * @example
               *
               *     bufferedBlockAlgorithm.reset();
               */
              reset: function () {
                // Initial values
                this._data = new WordArray.init();
                this._nDataBytes = 0;
              },

              /**
               * Adds new data to this block algorithm's buffer.
               *
               * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
               *
               * @example
               *
               *     bufferedBlockAlgorithm._append('data');
               *     bufferedBlockAlgorithm._append(wordArray);
               */
              _append: function (data) {
                // Convert string to WordArray, else assume WordArray already
                if (typeof data == 'string') {
                  data = Utf8.parse(data);
                }

                // Append
                this._data.concat(data);
                this._nDataBytes += data.sigBytes;
              },

              /**
               * Processes available data blocks.
               *
               * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
               *
               * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
               *
               * @return {WordArray} The processed data.
               *
               * @example
               *
               *     var processedData = bufferedBlockAlgorithm._process();
               *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
               */
              _process: function (doFlush) {
                var processedWords;

                // Shortcuts
                var data = this._data;
                var dataWords = data.words;
                var dataSigBytes = data.sigBytes;
                var blockSize = this.blockSize;
                var blockSizeBytes = blockSize * 4;

                // Count blocks ready
                var nBlocksReady = dataSigBytes / blockSizeBytes;
                if (doFlush) {
                  // Round up to include partial blocks
                  nBlocksReady = Math.ceil(nBlocksReady);
                } else {
                  // Round down to include only full blocks,
                  // less the number of blocks that must remain in the buffer
                  nBlocksReady = Math.max(
                    (nBlocksReady | 0) - this._minBufferSize,
                    0
                  );
                }

                // Count words ready
                var nWordsReady = nBlocksReady * blockSize;

                // Count bytes ready
                var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

                // Process blocks
                if (nWordsReady) {
                  for (
                    var offset = 0;
                    offset < nWordsReady;
                    offset += blockSize
                  ) {
                    // Perform concrete-algorithm logic
                    this._doProcessBlock(dataWords, offset);
                  }

                  // Remove processed words
                  processedWords = dataWords.splice(0, nWordsReady);
                  data.sigBytes -= nBytesReady;
                }

                // Return processed words
                return new WordArray.init(processedWords, nBytesReady);
              },

              /**
               * Creates a copy of this object.
               *
               * @return {Object} The clone.
               *
               * @example
               *
               *     var clone = bufferedBlockAlgorithm.clone();
               */
              clone: function () {
                var clone = Base.clone.call(this);
                clone._data = this._data.clone();

                return clone;
              },

              _minBufferSize: 0,
            }));

          /**
           * Abstract hasher template.
           *
           * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
           */
          C_lib.Hasher = BufferedBlockAlgorithm.extend({
            /**
             * Configuration options.
             */
            cfg: Base.extend(),

            /**
             * Initializes a newly created hasher.
             *
             * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
             *
             * @example
             *
             *     var hasher = CryptoJS.algo.SHA256.create();
             */
            init: function (cfg) {
              // Apply config defaults
              this.cfg = this.cfg.extend(cfg);

              // Set initial values
              this.reset();
            },

            /**
             * Resets this hasher to its initial state.
             *
             * @example
             *
             *     hasher.reset();
             */
            reset: function () {
              // Reset data buffer
              BufferedBlockAlgorithm.reset.call(this);

              // Perform concrete-hasher logic
              this._doReset();
            },

            /**
             * Updates this hasher with a message.
             *
             * @param {WordArray|string} messageUpdate The message to append.
             *
             * @return {Hasher} This hasher.
             *
             * @example
             *
             *     hasher.update('message');
             *     hasher.update(wordArray);
             */
            update: function (messageUpdate) {
              // Append
              this._append(messageUpdate);

              // Update the hash
              this._process();

              // Chainable
              return this;
            },

            /**
             * Finalizes the hash computation.
             * Note that the finalize operation is effectively a destructive, read-once operation.
             *
             * @param {WordArray|string} messageUpdate (Optional) A final message update.
             *
             * @return {WordArray} The hash.
             *
             * @example
             *
             *     var hash = hasher.finalize();
             *     var hash = hasher.finalize('message');
             *     var hash = hasher.finalize(wordArray);
             */
            finalize: function (messageUpdate) {
              // Final message update
              if (messageUpdate) {
                this._append(messageUpdate);
              }

              // Perform concrete-hasher logic
              var hash = this._doFinalize();

              return hash;
            },

            blockSize: 512 / 32,

            /**
             * Creates a shortcut function to a hasher's object interface.
             *
             * @param {Hasher} hasher The hasher to create a helper for.
             *
             * @return {Function} The shortcut function.
             *
             * @static
             *
             * @example
             *
             *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
             */
            _createHelper: function (hasher) {
              return function (message, cfg) {
                return new hasher.init(cfg).finalize(message);
              };
            },

            /**
             * Creates a shortcut function to the HMAC's object interface.
             *
             * @param {Hasher} hasher The hasher to use in this HMAC helper.
             *
             * @return {Function} The shortcut function.
             *
             * @static
             *
             * @example
             *
             *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
             */
            _createHmacHelper: function (hasher) {
              return function (message, key) {
                return new C_algo.HMAC.init(hasher, key).finalize(message);
              };
            },
          });

          /**
           * Algorithm namespace.
           */
          var C_algo = (C.algo = {});

          return C;
        })(Math);

      return CryptoJS;
    });
  })(core$1);
  return core$1.exports;
}

var x64Core$1 = { exports: {} };

var x64Core = x64Core$1.exports;

var hasRequiredX64Core;

function requireX64Core() {
  if (hasRequiredX64Core) return x64Core$1.exports;
  hasRequiredX64Core = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(x64Core, function (CryptoJS) {
      (function (undefined$1) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var X32WordArray = C_lib.WordArray;

        /**
         * x64 namespace.
         */
        var C_x64 = (C.x64 = {});

        /**
         * A 64-bit word.
         */
        C_x64.Word = Base.extend({
          /**
           * Initializes a newly created 64-bit word.
           *
           * @param {number} high The high 32 bits.
           * @param {number} low The low 32 bits.
           *
           * @example
           *
           *     var x64Word = CryptoJS.x64.Word.create(0x00010203, 0x04050607);
           */
          init: function (high, low) {
            this.high = high;
            this.low = low;
          },

          /**
           * Bitwise NOTs this word.
           *
           * @return {X64Word} A new x64-Word object after negating.
           *
           * @example
           *
           *     var negated = x64Word.not();
           */
          // not: function () {
          // var high = ~this.high;
          // var low = ~this.low;

          // return X64Word.create(high, low);
          // },

          /**
           * Bitwise ANDs this word with the passed word.
           *
           * @param {X64Word} word The x64-Word to AND with this word.
           *
           * @return {X64Word} A new x64-Word object after ANDing.
           *
           * @example
           *
           *     var anded = x64Word.and(anotherX64Word);
           */
          // and: function (word) {
          // var high = this.high & word.high;
          // var low = this.low & word.low;

          // return X64Word.create(high, low);
          // },

          /**
           * Bitwise ORs this word with the passed word.
           *
           * @param {X64Word} word The x64-Word to OR with this word.
           *
           * @return {X64Word} A new x64-Word object after ORing.
           *
           * @example
           *
           *     var ored = x64Word.or(anotherX64Word);
           */
          // or: function (word) {
          // var high = this.high | word.high;
          // var low = this.low | word.low;

          // return X64Word.create(high, low);
          // },

          /**
           * Bitwise XORs this word with the passed word.
           *
           * @param {X64Word} word The x64-Word to XOR with this word.
           *
           * @return {X64Word} A new x64-Word object after XORing.
           *
           * @example
           *
           *     var xored = x64Word.xor(anotherX64Word);
           */
          // xor: function (word) {
          // var high = this.high ^ word.high;
          // var low = this.low ^ word.low;

          // return X64Word.create(high, low);
          // },

          /**
           * Shifts this word n bits to the left.
           *
           * @param {number} n The number of bits to shift.
           *
           * @return {X64Word} A new x64-Word object after shifting.
           *
           * @example
           *
           *     var shifted = x64Word.shiftL(25);
           */
          // shiftL: function (n) {
          // if (n < 32) {
          // var high = (this.high << n) | (this.low >>> (32 - n));
          // var low = this.low << n;
          // } else {
          // var high = this.low << (n - 32);
          // var low = 0;
          // }

          // return X64Word.create(high, low);
          // },

          /**
           * Shifts this word n bits to the right.
           *
           * @param {number} n The number of bits to shift.
           *
           * @return {X64Word} A new x64-Word object after shifting.
           *
           * @example
           *
           *     var shifted = x64Word.shiftR(7);
           */
          // shiftR: function (n) {
          // if (n < 32) {
          // var low = (this.low >>> n) | (this.high << (32 - n));
          // var high = this.high >>> n;
          // } else {
          // var low = this.high >>> (n - 32);
          // var high = 0;
          // }

          // return X64Word.create(high, low);
          // },

          /**
           * Rotates this word n bits to the left.
           *
           * @param {number} n The number of bits to rotate.
           *
           * @return {X64Word} A new x64-Word object after rotating.
           *
           * @example
           *
           *     var rotated = x64Word.rotL(25);
           */
          // rotL: function (n) {
          // return this.shiftL(n).or(this.shiftR(64 - n));
          // },

          /**
           * Rotates this word n bits to the right.
           *
           * @param {number} n The number of bits to rotate.
           *
           * @return {X64Word} A new x64-Word object after rotating.
           *
           * @example
           *
           *     var rotated = x64Word.rotR(7);
           */
          // rotR: function (n) {
          // return this.shiftR(n).or(this.shiftL(64 - n));
          // },

          /**
           * Adds this word with the passed word.
           *
           * @param {X64Word} word The x64-Word to add with this word.
           *
           * @return {X64Word} A new x64-Word object after adding.
           *
           * @example
           *
           *     var added = x64Word.add(anotherX64Word);
           */
          // add: function (word) {
          // var low = (this.low + word.low) | 0;
          // var carry = (low >>> 0) < (this.low >>> 0) ? 1 : 0;
          // var high = (this.high + word.high + carry) | 0;

          // return X64Word.create(high, low);
          // }
        });

        /**
         * An array of 64-bit words.
         *
         * @property {Array} words The array of CryptoJS.x64.Word objects.
         * @property {number} sigBytes The number of significant bytes in this word array.
         */
        C_x64.WordArray = Base.extend({
          /**
           * Initializes a newly created word array.
           *
           * @param {Array} words (Optional) An array of CryptoJS.x64.Word objects.
           * @param {number} sigBytes (Optional) The number of significant bytes in the words.
           *
           * @example
           *
           *     var wordArray = CryptoJS.x64.WordArray.create();
           *
           *     var wordArray = CryptoJS.x64.WordArray.create([
           *         CryptoJS.x64.Word.create(0x00010203, 0x04050607),
           *         CryptoJS.x64.Word.create(0x18191a1b, 0x1c1d1e1f)
           *     ]);
           *
           *     var wordArray = CryptoJS.x64.WordArray.create([
           *         CryptoJS.x64.Word.create(0x00010203, 0x04050607),
           *         CryptoJS.x64.Word.create(0x18191a1b, 0x1c1d1e1f)
           *     ], 10);
           */
          init: function (words, sigBytes) {
            words = this.words = words || [];

            if (sigBytes != undefined$1) {
              this.sigBytes = sigBytes;
            } else {
              this.sigBytes = words.length * 8;
            }
          },

          /**
           * Converts this 64-bit word array to a 32-bit word array.
           *
           * @return {CryptoJS.lib.WordArray} This word array's data as a 32-bit word array.
           *
           * @example
           *
           *     var x32WordArray = x64WordArray.toX32();
           */
          toX32: function () {
            // Shortcuts
            var x64Words = this.words;
            var x64WordsLength = x64Words.length;

            // Convert
            var x32Words = [];
            for (var i = 0; i < x64WordsLength; i++) {
              var x64Word = x64Words[i];
              x32Words.push(x64Word.high);
              x32Words.push(x64Word.low);
            }

            return X32WordArray.create(x32Words, this.sigBytes);
          },

          /**
           * Creates a copy of this word array.
           *
           * @return {X64WordArray} The clone.
           *
           * @example
           *
           *     var clone = x64WordArray.clone();
           */
          clone: function () {
            var clone = Base.clone.call(this);

            // Clone "words" array
            var words = (clone.words = this.words.slice(0));

            // Clone each X64Word object
            var wordsLength = words.length;
            for (var i = 0; i < wordsLength; i++) {
              words[i] = words[i].clone();
            }

            return clone;
          },
        });
      })();

      return CryptoJS;
    });
  })(x64Core$1);
  return x64Core$1.exports;
}

var libTypedarrays$1 = { exports: {} };

var libTypedarrays = libTypedarrays$1.exports;

var hasRequiredLibTypedarrays;

function requireLibTypedarrays() {
  if (hasRequiredLibTypedarrays) return libTypedarrays$1.exports;
  hasRequiredLibTypedarrays = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(libTypedarrays, function (CryptoJS) {
      (function () {
        // Check if typed arrays are supported
        if (typeof ArrayBuffer != 'function') {
          return;
        }

        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;

        // Reference original init
        var superInit = WordArray.init;

        // Augment WordArray.init to handle typed arrays
        var subInit = (WordArray.init = function (typedArray) {
          // Convert buffers to uint8
          if (typedArray instanceof ArrayBuffer) {
            typedArray = new Uint8Array(typedArray);
          }

          // Convert other array views to uint8
          if (
            typedArray instanceof Int8Array ||
            (typeof Uint8ClampedArray !== 'undefined' &&
              typedArray instanceof Uint8ClampedArray) ||
            typedArray instanceof Int16Array ||
            typedArray instanceof Uint16Array ||
            typedArray instanceof Int32Array ||
            typedArray instanceof Uint32Array ||
            typedArray instanceof Float32Array ||
            typedArray instanceof Float64Array
          ) {
            typedArray = new Uint8Array(
              typedArray.buffer,
              typedArray.byteOffset,
              typedArray.byteLength
            );
          }

          // Handle Uint8Array
          if (typedArray instanceof Uint8Array) {
            // Shortcut
            var typedArrayByteLength = typedArray.byteLength;

            // Extract bytes
            var words = [];
            for (var i = 0; i < typedArrayByteLength; i++) {
              words[i >>> 2] |= typedArray[i] << (24 - (i % 4) * 8);
            }

            // Initialize this word array
            superInit.call(this, words, typedArrayByteLength);
          } else {
            // Else call normal init
            superInit.apply(this, arguments);
          }
        });

        subInit.prototype = WordArray;
      })();

      return CryptoJS.lib.WordArray;
    });
  })(libTypedarrays$1);
  return libTypedarrays$1.exports;
}

var encUtf16$1 = { exports: {} };

var encUtf16 = encUtf16$1.exports;

var hasRequiredEncUtf16;

function requireEncUtf16() {
  if (hasRequiredEncUtf16) return encUtf16$1.exports;
  hasRequiredEncUtf16 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(encUtf16, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var C_enc = C.enc;

        /**
         * UTF-16 BE encoding strategy.
         */
        C_enc.Utf16 = C_enc.Utf16BE = {
          /**
           * Converts a word array to a UTF-16 BE string.
           *
           * @param {WordArray} wordArray The word array.
           *
           * @return {string} The UTF-16 BE string.
           *
           * @static
           *
           * @example
           *
           *     var utf16String = CryptoJS.enc.Utf16.stringify(wordArray);
           */
          stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var utf16Chars = [];
            for (var i = 0; i < sigBytes; i += 2) {
              var codePoint = (words[i >>> 2] >>> (16 - (i % 4) * 8)) & 0xffff;
              utf16Chars.push(String.fromCharCode(codePoint));
            }

            return utf16Chars.join('');
          },

          /**
           * Converts a UTF-16 BE string to a word array.
           *
           * @param {string} utf16Str The UTF-16 BE string.
           *
           * @return {WordArray} The word array.
           *
           * @static
           *
           * @example
           *
           *     var wordArray = CryptoJS.enc.Utf16.parse(utf16String);
           */
          parse: function (utf16Str) {
            // Shortcut
            var utf16StrLength = utf16Str.length;

            // Convert
            var words = [];
            for (var i = 0; i < utf16StrLength; i++) {
              words[i >>> 1] |= utf16Str.charCodeAt(i) << (16 - (i % 2) * 16);
            }

            return WordArray.create(words, utf16StrLength * 2);
          },
        };

        /**
         * UTF-16 LE encoding strategy.
         */
        C_enc.Utf16LE = {
          /**
           * Converts a word array to a UTF-16 LE string.
           *
           * @param {WordArray} wordArray The word array.
           *
           * @return {string} The UTF-16 LE string.
           *
           * @static
           *
           * @example
           *
           *     var utf16Str = CryptoJS.enc.Utf16LE.stringify(wordArray);
           */
          stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var utf16Chars = [];
            for (var i = 0; i < sigBytes; i += 2) {
              var codePoint = swapEndian(
                (words[i >>> 2] >>> (16 - (i % 4) * 8)) & 0xffff
              );
              utf16Chars.push(String.fromCharCode(codePoint));
            }

            return utf16Chars.join('');
          },

          /**
           * Converts a UTF-16 LE string to a word array.
           *
           * @param {string} utf16Str The UTF-16 LE string.
           *
           * @return {WordArray} The word array.
           *
           * @static
           *
           * @example
           *
           *     var wordArray = CryptoJS.enc.Utf16LE.parse(utf16Str);
           */
          parse: function (utf16Str) {
            // Shortcut
            var utf16StrLength = utf16Str.length;

            // Convert
            var words = [];
            for (var i = 0; i < utf16StrLength; i++) {
              words[i >>> 1] |= swapEndian(
                utf16Str.charCodeAt(i) << (16 - (i % 2) * 16)
              );
            }

            return WordArray.create(words, utf16StrLength * 2);
          },
        };

        function swapEndian(word) {
          return ((word << 8) & 0xff00ff00) | ((word >>> 8) & 0x00ff00ff);
        }
      })();

      return CryptoJS.enc.Utf16;
    });
  })(encUtf16$1);
  return encUtf16$1.exports;
}

var encBase64$1 = { exports: {} };

var encBase64 = encBase64$1.exports;

var hasRequiredEncBase64;

function requireEncBase64() {
  if (hasRequiredEncBase64) return encBase64$1.exports;
  hasRequiredEncBase64 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(encBase64, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var C_enc = C.enc;

        /**
         * Base64 encoding strategy.
         */
        C_enc.Base64 = {
          /**
           * Converts a word array to a Base64 string.
           *
           * @param {WordArray} wordArray The word array.
           *
           * @return {string} The Base64 string.
           *
           * @static
           *
           * @example
           *
           *     var base64String = CryptoJS.enc.Base64.stringify(wordArray);
           */
          stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = this._map;

            // Clamp excess bits
            wordArray.clamp();

            // Convert
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
              var byte1 = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
              var byte2 =
                (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
              var byte3 =
                (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

              var triplet = (byte1 << 16) | (byte2 << 8) | byte3;

              for (var j = 0; j < 4 && i + j * 0.75 < sigBytes; j++) {
                base64Chars.push(
                  map.charAt((triplet >>> (6 * (3 - j))) & 0x3f)
                );
              }
            }

            // Add padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              while (base64Chars.length % 4) {
                base64Chars.push(paddingChar);
              }
            }

            return base64Chars.join('');
          },

          /**
           * Converts a Base64 string to a word array.
           *
           * @param {string} base64Str The Base64 string.
           *
           * @return {WordArray} The word array.
           *
           * @static
           *
           * @example
           *
           *     var wordArray = CryptoJS.enc.Base64.parse(base64String);
           */
          parse: function (base64Str) {
            // Shortcuts
            var base64StrLength = base64Str.length;
            var map = this._map;
            var reverseMap = this._reverseMap;

            if (!reverseMap) {
              reverseMap = this._reverseMap = [];
              for (var j = 0; j < map.length; j++) {
                reverseMap[map.charCodeAt(j)] = j;
              }
            }

            // Ignore padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              var paddingIndex = base64Str.indexOf(paddingChar);
              if (paddingIndex !== -1) {
                base64StrLength = paddingIndex;
              }
            }

            // Convert
            return parseLoop(base64Str, base64StrLength, reverseMap);
          },

          _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
        };

        function parseLoop(base64Str, base64StrLength, reverseMap) {
          var words = [];
          var nBytes = 0;
          for (var i = 0; i < base64StrLength; i++) {
            if (i % 4) {
              var bits1 =
                reverseMap[base64Str.charCodeAt(i - 1)] << ((i % 4) * 2);
              var bits2 =
                reverseMap[base64Str.charCodeAt(i)] >>> (6 - (i % 4) * 2);
              var bitsCombined = bits1 | bits2;
              words[nBytes >>> 2] |= bitsCombined << (24 - (nBytes % 4) * 8);
              nBytes++;
            }
          }
          return WordArray.create(words, nBytes);
        }
      })();

      return CryptoJS.enc.Base64;
    });
  })(encBase64$1);
  return encBase64$1.exports;
}

var encBase64url$1 = { exports: {} };

var encBase64url = encBase64url$1.exports;

var hasRequiredEncBase64url;

function requireEncBase64url() {
  if (hasRequiredEncBase64url) return encBase64url$1.exports;
  hasRequiredEncBase64url = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(encBase64url, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var C_enc = C.enc;

        /**
         * Base64url encoding strategy.
         */
        C_enc.Base64url = {
          /**
           * Converts a word array to a Base64url string.
           *
           * @param {WordArray} wordArray The word array.
           *
           * @param {boolean} urlSafe Whether to use url safe
           *
           * @return {string} The Base64url string.
           *
           * @static
           *
           * @example
           *
           *     var base64String = CryptoJS.enc.Base64url.stringify(wordArray);
           */
          stringify: function (wordArray, urlSafe) {
            if (urlSafe === undefined) {
              urlSafe = true;
            }
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = urlSafe ? this._safe_map : this._map;

            // Clamp excess bits
            wordArray.clamp();

            // Convert
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
              var byte1 = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
              var byte2 =
                (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
              var byte3 =
                (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

              var triplet = (byte1 << 16) | (byte2 << 8) | byte3;

              for (var j = 0; j < 4 && i + j * 0.75 < sigBytes; j++) {
                base64Chars.push(
                  map.charAt((triplet >>> (6 * (3 - j))) & 0x3f)
                );
              }
            }

            // Add padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              while (base64Chars.length % 4) {
                base64Chars.push(paddingChar);
              }
            }

            return base64Chars.join('');
          },

          /**
           * Converts a Base64url string to a word array.
           *
           * @param {string} base64Str The Base64url string.
           *
           * @param {boolean} urlSafe Whether to use url safe
           *
           * @return {WordArray} The word array.
           *
           * @static
           *
           * @example
           *
           *     var wordArray = CryptoJS.enc.Base64url.parse(base64String);
           */
          parse: function (base64Str, urlSafe) {
            if (urlSafe === undefined) {
              urlSafe = true;
            }

            // Shortcuts
            var base64StrLength = base64Str.length;
            var map = urlSafe ? this._safe_map : this._map;
            var reverseMap = this._reverseMap;

            if (!reverseMap) {
              reverseMap = this._reverseMap = [];
              for (var j = 0; j < map.length; j++) {
                reverseMap[map.charCodeAt(j)] = j;
              }
            }

            // Ignore padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              var paddingIndex = base64Str.indexOf(paddingChar);
              if (paddingIndex !== -1) {
                base64StrLength = paddingIndex;
              }
            }

            // Convert
            return parseLoop(base64Str, base64StrLength, reverseMap);
          },

          _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
          _safe_map:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
        };

        function parseLoop(base64Str, base64StrLength, reverseMap) {
          var words = [];
          var nBytes = 0;
          for (var i = 0; i < base64StrLength; i++) {
            if (i % 4) {
              var bits1 =
                reverseMap[base64Str.charCodeAt(i - 1)] << ((i % 4) * 2);
              var bits2 =
                reverseMap[base64Str.charCodeAt(i)] >>> (6 - (i % 4) * 2);
              var bitsCombined = bits1 | bits2;
              words[nBytes >>> 2] |= bitsCombined << (24 - (nBytes % 4) * 8);
              nBytes++;
            }
          }
          return WordArray.create(words, nBytes);
        }
      })();

      return CryptoJS.enc.Base64url;
    });
  })(encBase64url$1);
  return encBase64url$1.exports;
}

var md5$1 = { exports: {} };

var md5 = md5$1.exports;

var hasRequiredMd5;

function requireMd5() {
  if (hasRequiredMd5) return md5$1.exports;
  hasRequiredMd5 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(md5, function (CryptoJS) {
      (function (Math) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;

        // Constants table
        var T = [];

        // Compute constants
        (function () {
          for (var i = 0; i < 64; i++) {
            T[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
          }
        })();

        /**
         * MD5 hash algorithm.
         */
        var MD5 = (C_algo.MD5 = Hasher.extend({
          _doReset: function () {
            this._hash = new WordArray.init([
              0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476,
            ]);
          },

          _doProcessBlock: function (M, offset) {
            // Swap endian
            for (var i = 0; i < 16; i++) {
              // Shortcuts
              var offset_i = offset + i;
              var M_offset_i = M[offset_i];

              M[offset_i] =
                (((M_offset_i << 8) | (M_offset_i >>> 24)) & 0x00ff00ff) |
                (((M_offset_i << 24) | (M_offset_i >>> 8)) & 0xff00ff00);
            }

            // Shortcuts
            var H = this._hash.words;

            var M_offset_0 = M[offset + 0];
            var M_offset_1 = M[offset + 1];
            var M_offset_2 = M[offset + 2];
            var M_offset_3 = M[offset + 3];
            var M_offset_4 = M[offset + 4];
            var M_offset_5 = M[offset + 5];
            var M_offset_6 = M[offset + 6];
            var M_offset_7 = M[offset + 7];
            var M_offset_8 = M[offset + 8];
            var M_offset_9 = M[offset + 9];
            var M_offset_10 = M[offset + 10];
            var M_offset_11 = M[offset + 11];
            var M_offset_12 = M[offset + 12];
            var M_offset_13 = M[offset + 13];
            var M_offset_14 = M[offset + 14];
            var M_offset_15 = M[offset + 15];

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];

            // Computation
            a = FF(a, b, c, d, M_offset_0, 7, T[0]);
            d = FF(d, a, b, c, M_offset_1, 12, T[1]);
            c = FF(c, d, a, b, M_offset_2, 17, T[2]);
            b = FF(b, c, d, a, M_offset_3, 22, T[3]);
            a = FF(a, b, c, d, M_offset_4, 7, T[4]);
            d = FF(d, a, b, c, M_offset_5, 12, T[5]);
            c = FF(c, d, a, b, M_offset_6, 17, T[6]);
            b = FF(b, c, d, a, M_offset_7, 22, T[7]);
            a = FF(a, b, c, d, M_offset_8, 7, T[8]);
            d = FF(d, a, b, c, M_offset_9, 12, T[9]);
            c = FF(c, d, a, b, M_offset_10, 17, T[10]);
            b = FF(b, c, d, a, M_offset_11, 22, T[11]);
            a = FF(a, b, c, d, M_offset_12, 7, T[12]);
            d = FF(d, a, b, c, M_offset_13, 12, T[13]);
            c = FF(c, d, a, b, M_offset_14, 17, T[14]);
            b = FF(b, c, d, a, M_offset_15, 22, T[15]);

            a = GG(a, b, c, d, M_offset_1, 5, T[16]);
            d = GG(d, a, b, c, M_offset_6, 9, T[17]);
            c = GG(c, d, a, b, M_offset_11, 14, T[18]);
            b = GG(b, c, d, a, M_offset_0, 20, T[19]);
            a = GG(a, b, c, d, M_offset_5, 5, T[20]);
            d = GG(d, a, b, c, M_offset_10, 9, T[21]);
            c = GG(c, d, a, b, M_offset_15, 14, T[22]);
            b = GG(b, c, d, a, M_offset_4, 20, T[23]);
            a = GG(a, b, c, d, M_offset_9, 5, T[24]);
            d = GG(d, a, b, c, M_offset_14, 9, T[25]);
            c = GG(c, d, a, b, M_offset_3, 14, T[26]);
            b = GG(b, c, d, a, M_offset_8, 20, T[27]);
            a = GG(a, b, c, d, M_offset_13, 5, T[28]);
            d = GG(d, a, b, c, M_offset_2, 9, T[29]);
            c = GG(c, d, a, b, M_offset_7, 14, T[30]);
            b = GG(b, c, d, a, M_offset_12, 20, T[31]);

            a = HH(a, b, c, d, M_offset_5, 4, T[32]);
            d = HH(d, a, b, c, M_offset_8, 11, T[33]);
            c = HH(c, d, a, b, M_offset_11, 16, T[34]);
            b = HH(b, c, d, a, M_offset_14, 23, T[35]);
            a = HH(a, b, c, d, M_offset_1, 4, T[36]);
            d = HH(d, a, b, c, M_offset_4, 11, T[37]);
            c = HH(c, d, a, b, M_offset_7, 16, T[38]);
            b = HH(b, c, d, a, M_offset_10, 23, T[39]);
            a = HH(a, b, c, d, M_offset_13, 4, T[40]);
            d = HH(d, a, b, c, M_offset_0, 11, T[41]);
            c = HH(c, d, a, b, M_offset_3, 16, T[42]);
            b = HH(b, c, d, a, M_offset_6, 23, T[43]);
            a = HH(a, b, c, d, M_offset_9, 4, T[44]);
            d = HH(d, a, b, c, M_offset_12, 11, T[45]);
            c = HH(c, d, a, b, M_offset_15, 16, T[46]);
            b = HH(b, c, d, a, M_offset_2, 23, T[47]);

            a = II(a, b, c, d, M_offset_0, 6, T[48]);
            d = II(d, a, b, c, M_offset_7, 10, T[49]);
            c = II(c, d, a, b, M_offset_14, 15, T[50]);
            b = II(b, c, d, a, M_offset_5, 21, T[51]);
            a = II(a, b, c, d, M_offset_12, 6, T[52]);
            d = II(d, a, b, c, M_offset_3, 10, T[53]);
            c = II(c, d, a, b, M_offset_10, 15, T[54]);
            b = II(b, c, d, a, M_offset_1, 21, T[55]);
            a = II(a, b, c, d, M_offset_8, 6, T[56]);
            d = II(d, a, b, c, M_offset_15, 10, T[57]);
            c = II(c, d, a, b, M_offset_6, 15, T[58]);
            b = II(b, c, d, a, M_offset_13, 21, T[59]);
            a = II(a, b, c, d, M_offset_4, 6, T[60]);
            d = II(d, a, b, c, M_offset_11, 10, T[61]);
            c = II(c, d, a, b, M_offset_2, 15, T[62]);
            b = II(b, c, d, a, M_offset_9, 21, T[63]);

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));

            var nBitsTotalH = Math.floor(nBitsTotal / 0x100000000);
            var nBitsTotalL = nBitsTotal;
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] =
              (((nBitsTotalH << 8) | (nBitsTotalH >>> 24)) & 0x00ff00ff) |
              (((nBitsTotalH << 24) | (nBitsTotalH >>> 8)) & 0xff00ff00);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] =
              (((nBitsTotalL << 8) | (nBitsTotalL >>> 24)) & 0x00ff00ff) |
              (((nBitsTotalL << 24) | (nBitsTotalL >>> 8)) & 0xff00ff00);

            data.sigBytes = (dataWords.length + 1) * 4;

            // Hash final blocks
            this._process();

            // Shortcuts
            var hash = this._hash;
            var H = hash.words;

            // Swap endian
            for (var i = 0; i < 4; i++) {
              // Shortcut
              var H_i = H[i];

              H[i] =
                (((H_i << 8) | (H_i >>> 24)) & 0x00ff00ff) |
                (((H_i << 24) | (H_i >>> 8)) & 0xff00ff00);
            }

            // Return final computed hash
            return hash;
          },

          clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          },
        }));

        function FF(a, b, c, d, x, s, t) {
          var n = a + ((b & c) | (~b & d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function GG(a, b, c, d, x, s, t) {
          var n = a + ((b & d) | (c & ~d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function HH(a, b, c, d, x, s, t) {
          var n = a + (b ^ c ^ d) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function II(a, b, c, d, x, s, t) {
          var n = a + (c ^ (b | ~d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.MD5('message');
         *     var hash = CryptoJS.MD5(wordArray);
         */
        C.MD5 = Hasher._createHelper(MD5);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacMD5(message, key);
         */
        C.HmacMD5 = Hasher._createHmacHelper(MD5);
      })(Math);

      return CryptoJS.MD5;
    });
  })(md5$1);
  return md5$1.exports;
}

var sha1$1 = { exports: {} };

var sha1 = sha1$1.exports;

var hasRequiredSha1;

function requireSha1() {
  if (hasRequiredSha1) return sha1$1.exports;
  hasRequiredSha1 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(sha1, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;

        // Reusable object
        var W = [];

        /**
         * SHA-1 hash algorithm.
         */
        var SHA1 = (C_algo.SHA1 = Hasher.extend({
          _doReset: function () {
            this._hash = new WordArray.init([
              0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
            ]);
          },

          _doProcessBlock: function (M, offset) {
            // Shortcut
            var H = this._hash.words;

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];

            // Computation
            for (var i = 0; i < 80; i++) {
              if (i < 16) {
                W[i] = M[offset + i] | 0;
              } else {
                var n = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
                W[i] = (n << 1) | (n >>> 31);
              }

              var t = ((a << 5) | (a >>> 27)) + e + W[i];
              if (i < 20) {
                t += ((b & c) | (~b & d)) + 0x5a827999;
              } else if (i < 40) {
                t += (b ^ c ^ d) + 0x6ed9eba1;
              } else if (i < 60) {
                t += ((b & c) | (b & d) | (c & d)) - 0x70e44324;
              } /* if (i < 80) */ else {
                t += (b ^ c ^ d) - 0x359d3e2a;
              }

              e = d;
              d = c;
              c = (b << 30) | (b >>> 2);
              b = a;
              a = t;
            }

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(
              nBitsTotal / 0x100000000
            );
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Return final computed hash
            return this._hash;
          },

          clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          },
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA1('message');
         *     var hash = CryptoJS.SHA1(wordArray);
         */
        C.SHA1 = Hasher._createHelper(SHA1);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA1(message, key);
         */
        C.HmacSHA1 = Hasher._createHmacHelper(SHA1);
      })();

      return CryptoJS.SHA1;
    });
  })(sha1$1);
  return sha1$1.exports;
}

var sha256$1 = { exports: {} };

var sha256 = sha256$1.exports;

var hasRequiredSha256;

function requireSha256() {
  if (hasRequiredSha256) return sha256$1.exports;
  hasRequiredSha256 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(sha256, function (CryptoJS) {
      (function (Math) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;

        // Initialization and round constants tables
        var H = [];
        var K = [];

        // Compute constants
        (function () {
          function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
              if (!(n % factor)) {
                return false;
              }
            }

            return true;
          }

          function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
          }

          var n = 2;
          var nPrime = 0;
          while (nPrime < 64) {
            if (isPrime(n)) {
              if (nPrime < 8) {
                H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
              }
              K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

              nPrime++;
            }

            n++;
          }
        })();

        // Reusable object
        var W = [];

        /**
         * SHA-256 hash algorithm.
         */
        var SHA256 = (C_algo.SHA256 = Hasher.extend({
          _doReset: function () {
            this._hash = new WordArray.init(H.slice(0));
          },

          _doProcessBlock: function (M, offset) {
            // Shortcut
            var H = this._hash.words;

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];

            // Computation
            for (var i = 0; i < 64; i++) {
              if (i < 16) {
                W[i] = M[offset + i] | 0;
              } else {
                var gamma0x = W[i - 15];
                var gamma0 =
                  ((gamma0x << 25) | (gamma0x >>> 7)) ^
                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
                  (gamma0x >>> 3);

                var gamma1x = W[i - 2];
                var gamma1 =
                  ((gamma1x << 15) | (gamma1x >>> 17)) ^
                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
                  (gamma1x >>> 10);

                W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
              }

              var ch = (e & f) ^ (~e & g);
              var maj = (a & b) ^ (a & c) ^ (b & c);

              var sigma0 =
                ((a << 30) | (a >>> 2)) ^
                ((a << 19) | (a >>> 13)) ^
                ((a << 10) | (a >>> 22));
              var sigma1 =
                ((e << 26) | (e >>> 6)) ^
                ((e << 21) | (e >>> 11)) ^
                ((e << 7) | (e >>> 25));

              var t1 = h + sigma1 + ch + K[i] + W[i];
              var t2 = sigma0 + maj;

              h = g;
              g = f;
              f = e;
              e = (d + t1) | 0;
              d = c;
              c = b;
              b = a;
              a = (t1 + t2) | 0;
            }

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(
              nBitsTotal / 0x100000000
            );
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Return final computed hash
            return this._hash;
          },

          clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          },
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA256('message');
         *     var hash = CryptoJS.SHA256(wordArray);
         */
        C.SHA256 = Hasher._createHelper(SHA256);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA256(message, key);
         */
        C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
      })(Math);

      return CryptoJS.SHA256;
    });
  })(sha256$1);
  return sha256$1.exports;
}

var sha224$1 = { exports: {} };

var sha224 = sha224$1.exports;

var hasRequiredSha224;

function requireSha224() {
  if (hasRequiredSha224) return sha224$1.exports;
  hasRequiredSha224 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireSha256());
      }
    })(sha224, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var C_algo = C.algo;
        var SHA256 = C_algo.SHA256;

        /**
         * SHA-224 hash algorithm.
         */
        var SHA224 = (C_algo.SHA224 = SHA256.extend({
          _doReset: function () {
            this._hash = new WordArray.init([
              0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31,
              0x68581511, 0x64f98fa7, 0xbefa4fa4,
            ]);
          },

          _doFinalize: function () {
            var hash = SHA256._doFinalize.call(this);

            hash.sigBytes -= 4;

            return hash;
          },
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA224('message');
         *     var hash = CryptoJS.SHA224(wordArray);
         */
        C.SHA224 = SHA256._createHelper(SHA224);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA224(message, key);
         */
        C.HmacSHA224 = SHA256._createHmacHelper(SHA224);
      })();

      return CryptoJS.SHA224;
    });
  })(sha224$1);
  return sha224$1.exports;
}

var sha512$1 = { exports: {} };

var sha512 = sha512$1.exports;

var hasRequiredSha512;

function requireSha512() {
  if (hasRequiredSha512) return sha512$1.exports;
  hasRequiredSha512 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireX64Core());
      }
    })(sha512, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Hasher = C_lib.Hasher;
        var C_x64 = C.x64;
        var X64Word = C_x64.Word;
        var X64WordArray = C_x64.WordArray;
        var C_algo = C.algo;

        function X64Word_create() {
          return X64Word.create.apply(X64Word, arguments);
        }

        // Constants
        var K = [
          X64Word_create(0x428a2f98, 0xd728ae22),
          X64Word_create(0x71374491, 0x23ef65cd),
          X64Word_create(0xb5c0fbcf, 0xec4d3b2f),
          X64Word_create(0xe9b5dba5, 0x8189dbbc),
          X64Word_create(0x3956c25b, 0xf348b538),
          X64Word_create(0x59f111f1, 0xb605d019),
          X64Word_create(0x923f82a4, 0xaf194f9b),
          X64Word_create(0xab1c5ed5, 0xda6d8118),
          X64Word_create(0xd807aa98, 0xa3030242),
          X64Word_create(0x12835b01, 0x45706fbe),
          X64Word_create(0x243185be, 0x4ee4b28c),
          X64Word_create(0x550c7dc3, 0xd5ffb4e2),
          X64Word_create(0x72be5d74, 0xf27b896f),
          X64Word_create(0x80deb1fe, 0x3b1696b1),
          X64Word_create(0x9bdc06a7, 0x25c71235),
          X64Word_create(0xc19bf174, 0xcf692694),
          X64Word_create(0xe49b69c1, 0x9ef14ad2),
          X64Word_create(0xefbe4786, 0x384f25e3),
          X64Word_create(0x0fc19dc6, 0x8b8cd5b5),
          X64Word_create(0x240ca1cc, 0x77ac9c65),
          X64Word_create(0x2de92c6f, 0x592b0275),
          X64Word_create(0x4a7484aa, 0x6ea6e483),
          X64Word_create(0x5cb0a9dc, 0xbd41fbd4),
          X64Word_create(0x76f988da, 0x831153b5),
          X64Word_create(0x983e5152, 0xee66dfab),
          X64Word_create(0xa831c66d, 0x2db43210),
          X64Word_create(0xb00327c8, 0x98fb213f),
          X64Word_create(0xbf597fc7, 0xbeef0ee4),
          X64Word_create(0xc6e00bf3, 0x3da88fc2),
          X64Word_create(0xd5a79147, 0x930aa725),
          X64Word_create(0x06ca6351, 0xe003826f),
          X64Word_create(0x14292967, 0x0a0e6e70),
          X64Word_create(0x27b70a85, 0x46d22ffc),
          X64Word_create(0x2e1b2138, 0x5c26c926),
          X64Word_create(0x4d2c6dfc, 0x5ac42aed),
          X64Word_create(0x53380d13, 0x9d95b3df),
          X64Word_create(0x650a7354, 0x8baf63de),
          X64Word_create(0x766a0abb, 0x3c77b2a8),
          X64Word_create(0x81c2c92e, 0x47edaee6),
          X64Word_create(0x92722c85, 0x1482353b),
          X64Word_create(0xa2bfe8a1, 0x4cf10364),
          X64Word_create(0xa81a664b, 0xbc423001),
          X64Word_create(0xc24b8b70, 0xd0f89791),
          X64Word_create(0xc76c51a3, 0x0654be30),
          X64Word_create(0xd192e819, 0xd6ef5218),
          X64Word_create(0xd6990624, 0x5565a910),
          X64Word_create(0xf40e3585, 0x5771202a),
          X64Word_create(0x106aa070, 0x32bbd1b8),
          X64Word_create(0x19a4c116, 0xb8d2d0c8),
          X64Word_create(0x1e376c08, 0x5141ab53),
          X64Word_create(0x2748774c, 0xdf8eeb99),
          X64Word_create(0x34b0bcb5, 0xe19b48a8),
          X64Word_create(0x391c0cb3, 0xc5c95a63),
          X64Word_create(0x4ed8aa4a, 0xe3418acb),
          X64Word_create(0x5b9cca4f, 0x7763e373),
          X64Word_create(0x682e6ff3, 0xd6b2b8a3),
          X64Word_create(0x748f82ee, 0x5defb2fc),
          X64Word_create(0x78a5636f, 0x43172f60),
          X64Word_create(0x84c87814, 0xa1f0ab72),
          X64Word_create(0x8cc70208, 0x1a6439ec),
          X64Word_create(0x90befffa, 0x23631e28),
          X64Word_create(0xa4506ceb, 0xde82bde9),
          X64Word_create(0xbef9a3f7, 0xb2c67915),
          X64Word_create(0xc67178f2, 0xe372532b),
          X64Word_create(0xca273ece, 0xea26619c),
          X64Word_create(0xd186b8c7, 0x21c0c207),
          X64Word_create(0xeada7dd6, 0xcde0eb1e),
          X64Word_create(0xf57d4f7f, 0xee6ed178),
          X64Word_create(0x06f067aa, 0x72176fba),
          X64Word_create(0x0a637dc5, 0xa2c898a6),
          X64Word_create(0x113f9804, 0xbef90dae),
          X64Word_create(0x1b710b35, 0x131c471b),
          X64Word_create(0x28db77f5, 0x23047d84),
          X64Word_create(0x32caab7b, 0x40c72493),
          X64Word_create(0x3c9ebe0a, 0x15c9bebc),
          X64Word_create(0x431d67c4, 0x9c100d4c),
          X64Word_create(0x4cc5d4be, 0xcb3e42b6),
          X64Word_create(0x597f299c, 0xfc657e2a),
          X64Word_create(0x5fcb6fab, 0x3ad6faec),
          X64Word_create(0x6c44198c, 0x4a475817),
        ];

        // Reusable objects
        var W = [];
        (function () {
          for (var i = 0; i < 80; i++) {
            W[i] = X64Word_create();
          }
        })();

        /**
         * SHA-512 hash algorithm.
         */
        var SHA512 = (C_algo.SHA512 = Hasher.extend({
          _doReset: function () {
            this._hash = new X64WordArray.init([
              new X64Word.init(0x6a09e667, 0xf3bcc908),
              new X64Word.init(0xbb67ae85, 0x84caa73b),
              new X64Word.init(0x3c6ef372, 0xfe94f82b),
              new X64Word.init(0xa54ff53a, 0x5f1d36f1),
              new X64Word.init(0x510e527f, 0xade682d1),
              new X64Word.init(0x9b05688c, 0x2b3e6c1f),
              new X64Word.init(0x1f83d9ab, 0xfb41bd6b),
              new X64Word.init(0x5be0cd19, 0x137e2179),
            ]);
          },

          _doProcessBlock: function (M, offset) {
            // Shortcuts
            var H = this._hash.words;

            var H0 = H[0];
            var H1 = H[1];
            var H2 = H[2];
            var H3 = H[3];
            var H4 = H[4];
            var H5 = H[5];
            var H6 = H[6];
            var H7 = H[7];

            var H0h = H0.high;
            var H0l = H0.low;
            var H1h = H1.high;
            var H1l = H1.low;
            var H2h = H2.high;
            var H2l = H2.low;
            var H3h = H3.high;
            var H3l = H3.low;
            var H4h = H4.high;
            var H4l = H4.low;
            var H5h = H5.high;
            var H5l = H5.low;
            var H6h = H6.high;
            var H6l = H6.low;
            var H7h = H7.high;
            var H7l = H7.low;

            // Working variables
            var ah = H0h;
            var al = H0l;
            var bh = H1h;
            var bl = H1l;
            var ch = H2h;
            var cl = H2l;
            var dh = H3h;
            var dl = H3l;
            var eh = H4h;
            var el = H4l;
            var fh = H5h;
            var fl = H5l;
            var gh = H6h;
            var gl = H6l;
            var hh = H7h;
            var hl = H7l;

            // Rounds
            for (var i = 0; i < 80; i++) {
              var Wil;
              var Wih;

              // Shortcut
              var Wi = W[i];

              // Extend message
              if (i < 16) {
                Wih = Wi.high = M[offset + i * 2] | 0;
                Wil = Wi.low = M[offset + i * 2 + 1] | 0;
              } else {
                // Gamma0
                var gamma0x = W[i - 15];
                var gamma0xh = gamma0x.high;
                var gamma0xl = gamma0x.low;
                var gamma0h =
                  ((gamma0xh >>> 1) | (gamma0xl << 31)) ^
                  ((gamma0xh >>> 8) | (gamma0xl << 24)) ^
                  (gamma0xh >>> 7);
                var gamma0l =
                  ((gamma0xl >>> 1) | (gamma0xh << 31)) ^
                  ((gamma0xl >>> 8) | (gamma0xh << 24)) ^
                  ((gamma0xl >>> 7) | (gamma0xh << 25));

                // Gamma1
                var gamma1x = W[i - 2];
                var gamma1xh = gamma1x.high;
                var gamma1xl = gamma1x.low;
                var gamma1h =
                  ((gamma1xh >>> 19) | (gamma1xl << 13)) ^
                  ((gamma1xh << 3) | (gamma1xl >>> 29)) ^
                  (gamma1xh >>> 6);
                var gamma1l =
                  ((gamma1xl >>> 19) | (gamma1xh << 13)) ^
                  ((gamma1xl << 3) | (gamma1xh >>> 29)) ^
                  ((gamma1xl >>> 6) | (gamma1xh << 26));

                // W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16]
                var Wi7 = W[i - 7];
                var Wi7h = Wi7.high;
                var Wi7l = Wi7.low;

                var Wi16 = W[i - 16];
                var Wi16h = Wi16.high;
                var Wi16l = Wi16.low;

                Wil = gamma0l + Wi7l;
                Wih = gamma0h + Wi7h + (Wil >>> 0 < gamma0l >>> 0 ? 1 : 0);
                Wil = Wil + gamma1l;
                Wih = Wih + gamma1h + (Wil >>> 0 < gamma1l >>> 0 ? 1 : 0);
                Wil = Wil + Wi16l;
                Wih = Wih + Wi16h + (Wil >>> 0 < Wi16l >>> 0 ? 1 : 0);

                Wi.high = Wih;
                Wi.low = Wil;
              }

              var chh = (eh & fh) ^ (~eh & gh);
              var chl = (el & fl) ^ (~el & gl);
              var majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
              var majl = (al & bl) ^ (al & cl) ^ (bl & cl);

              var sigma0h =
                ((ah >>> 28) | (al << 4)) ^
                ((ah << 30) | (al >>> 2)) ^
                ((ah << 25) | (al >>> 7));
              var sigma0l =
                ((al >>> 28) | (ah << 4)) ^
                ((al << 30) | (ah >>> 2)) ^
                ((al << 25) | (ah >>> 7));
              var sigma1h =
                ((eh >>> 14) | (el << 18)) ^
                ((eh >>> 18) | (el << 14)) ^
                ((eh << 23) | (el >>> 9));
              var sigma1l =
                ((el >>> 14) | (eh << 18)) ^
                ((el >>> 18) | (eh << 14)) ^
                ((el << 23) | (eh >>> 9));

              // t1 = h + sigma1 + ch + K[i] + W[i]
              var Ki = K[i];
              var Kih = Ki.high;
              var Kil = Ki.low;

              var t1l = hl + sigma1l;
              var t1h = hh + sigma1h + (t1l >>> 0 < hl >>> 0 ? 1 : 0);
              var t1l = t1l + chl;
              var t1h = t1h + chh + (t1l >>> 0 < chl >>> 0 ? 1 : 0);
              var t1l = t1l + Kil;
              var t1h = t1h + Kih + (t1l >>> 0 < Kil >>> 0 ? 1 : 0);
              var t1l = t1l + Wil;
              var t1h = t1h + Wih + (t1l >>> 0 < Wil >>> 0 ? 1 : 0);

              // t2 = sigma0 + maj
              var t2l = sigma0l + majl;
              var t2h = sigma0h + majh + (t2l >>> 0 < sigma0l >>> 0 ? 1 : 0);

              // Update working variables
              hh = gh;
              hl = gl;
              gh = fh;
              gl = fl;
              fh = eh;
              fl = el;
              el = (dl + t1l) | 0;
              eh = (dh + t1h + (el >>> 0 < dl >>> 0 ? 1 : 0)) | 0;
              dh = ch;
              dl = cl;
              ch = bh;
              cl = bl;
              bh = ah;
              bl = al;
              al = (t1l + t2l) | 0;
              ah = (t1h + t2h + (al >>> 0 < t1l >>> 0 ? 1 : 0)) | 0;
            }

            // Intermediate hash value
            H0l = H0.low = H0l + al;
            H0.high = H0h + ah + (H0l >>> 0 < al >>> 0 ? 1 : 0);
            H1l = H1.low = H1l + bl;
            H1.high = H1h + bh + (H1l >>> 0 < bl >>> 0 ? 1 : 0);
            H2l = H2.low = H2l + cl;
            H2.high = H2h + ch + (H2l >>> 0 < cl >>> 0 ? 1 : 0);
            H3l = H3.low = H3l + dl;
            H3.high = H3h + dh + (H3l >>> 0 < dl >>> 0 ? 1 : 0);
            H4l = H4.low = H4l + el;
            H4.high = H4h + eh + (H4l >>> 0 < el >>> 0 ? 1 : 0);
            H5l = H5.low = H5l + fl;
            H5.high = H5h + fh + (H5l >>> 0 < fl >>> 0 ? 1 : 0);
            H6l = H6.low = H6l + gl;
            H6.high = H6h + gh + (H6l >>> 0 < gl >>> 0 ? 1 : 0);
            H7l = H7.low = H7l + hl;
            H7.high = H7h + hh + (H7l >>> 0 < hl >>> 0 ? 1 : 0);
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));
            dataWords[(((nBitsLeft + 128) >>> 10) << 5) + 30] = Math.floor(
              nBitsTotal / 0x100000000
            );
            dataWords[(((nBitsLeft + 128) >>> 10) << 5) + 31] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Convert hash to 32-bit word array before returning
            var hash = this._hash.toX32();

            // Return final computed hash
            return hash;
          },

          clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          },

          blockSize: 1024 / 32,
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA512('message');
         *     var hash = CryptoJS.SHA512(wordArray);
         */
        C.SHA512 = Hasher._createHelper(SHA512);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA512(message, key);
         */
        C.HmacSHA512 = Hasher._createHmacHelper(SHA512);
      })();

      return CryptoJS.SHA512;
    });
  })(sha512$1);
  return sha512$1.exports;
}

var sha384$1 = { exports: {} };

var sha384 = sha384$1.exports;

var hasRequiredSha384;

function requireSha384() {
  if (hasRequiredSha384) return sha384$1.exports;
  hasRequiredSha384 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireX64Core(),
          requireSha512()
        );
      }
    })(sha384, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_x64 = C.x64;
        var X64Word = C_x64.Word;
        var X64WordArray = C_x64.WordArray;
        var C_algo = C.algo;
        var SHA512 = C_algo.SHA512;

        /**
         * SHA-384 hash algorithm.
         */
        var SHA384 = (C_algo.SHA384 = SHA512.extend({
          _doReset: function () {
            this._hash = new X64WordArray.init([
              new X64Word.init(0xcbbb9d5d, 0xc1059ed8),
              new X64Word.init(0x629a292a, 0x367cd507),
              new X64Word.init(0x9159015a, 0x3070dd17),
              new X64Word.init(0x152fecd8, 0xf70e5939),
              new X64Word.init(0x67332667, 0xffc00b31),
              new X64Word.init(0x8eb44a87, 0x68581511),
              new X64Word.init(0xdb0c2e0d, 0x64f98fa7),
              new X64Word.init(0x47b5481d, 0xbefa4fa4),
            ]);
          },

          _doFinalize: function () {
            var hash = SHA512._doFinalize.call(this);

            hash.sigBytes -= 16;

            return hash;
          },
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA384('message');
         *     var hash = CryptoJS.SHA384(wordArray);
         */
        C.SHA384 = SHA512._createHelper(SHA384);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA384(message, key);
         */
        C.HmacSHA384 = SHA512._createHmacHelper(SHA384);
      })();

      return CryptoJS.SHA384;
    });
  })(sha384$1);
  return sha384$1.exports;
}

var sha3$1 = { exports: {} };

var sha3 = sha3$1.exports;

var hasRequiredSha3;

function requireSha3() {
  if (hasRequiredSha3) return sha3$1.exports;
  hasRequiredSha3 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireX64Core());
      }
    })(sha3, function (CryptoJS) {
      (function (Math) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_x64 = C.x64;
        var X64Word = C_x64.Word;
        var C_algo = C.algo;

        // Constants tables
        var RHO_OFFSETS = [];
        var PI_INDEXES = [];
        var ROUND_CONSTANTS = [];

        // Compute Constants
        (function () {
          // Compute rho offset constants
          var x = 1,
            y = 0;
          for (var t = 0; t < 24; t++) {
            RHO_OFFSETS[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64;

            var newX = y % 5;
            var newY = (2 * x + 3 * y) % 5;
            x = newX;
            y = newY;
          }

          // Compute pi index constants
          for (var x = 0; x < 5; x++) {
            for (var y = 0; y < 5; y++) {
              PI_INDEXES[x + 5 * y] = y + ((2 * x + 3 * y) % 5) * 5;
            }
          }

          // Compute round constants
          var LFSR = 0x01;
          for (var i = 0; i < 24; i++) {
            var roundConstantMsw = 0;
            var roundConstantLsw = 0;

            for (var j = 0; j < 7; j++) {
              if (LFSR & 0x01) {
                var bitPosition = (1 << j) - 1;
                if (bitPosition < 32) {
                  roundConstantLsw ^= 1 << bitPosition;
                } /* if (bitPosition >= 32) */ else {
                  roundConstantMsw ^= 1 << (bitPosition - 32);
                }
              }

              // Compute next LFSR
              if (LFSR & 0x80) {
                // Primitive polynomial over GF(2): x^8 + x^6 + x^5 + x^4 + 1
                LFSR = (LFSR << 1) ^ 0x71;
              } else {
                LFSR <<= 1;
              }
            }

            ROUND_CONSTANTS[i] = X64Word.create(
              roundConstantMsw,
              roundConstantLsw
            );
          }
        })();

        // Reusable objects for temporary values
        var T = [];
        (function () {
          for (var i = 0; i < 25; i++) {
            T[i] = X64Word.create();
          }
        })();

        /**
         * SHA-3 hash algorithm.
         */
        var SHA3 = (C_algo.SHA3 = Hasher.extend({
          /**
           * Configuration options.
           *
           * @property {number} outputLength
           *   The desired number of bits in the output hash.
           *   Only values permitted are: 224, 256, 384, 512.
           *   Default: 512
           */
          cfg: Hasher.cfg.extend({
            outputLength: 512,
          }),

          _doReset: function () {
            var state = (this._state = []);
            for (var i = 0; i < 25; i++) {
              state[i] = new X64Word.init();
            }

            this.blockSize = (1600 - 2 * this.cfg.outputLength) / 32;
          },

          _doProcessBlock: function (M, offset) {
            // Shortcuts
            var state = this._state;
            var nBlockSizeLanes = this.blockSize / 2;

            // Absorb
            for (var i = 0; i < nBlockSizeLanes; i++) {
              // Shortcuts
              var M2i = M[offset + 2 * i];
              var M2i1 = M[offset + 2 * i + 1];

              // Swap endian
              M2i =
                (((M2i << 8) | (M2i >>> 24)) & 0x00ff00ff) |
                (((M2i << 24) | (M2i >>> 8)) & 0xff00ff00);
              M2i1 =
                (((M2i1 << 8) | (M2i1 >>> 24)) & 0x00ff00ff) |
                (((M2i1 << 24) | (M2i1 >>> 8)) & 0xff00ff00);

              // Absorb message into state
              var lane = state[i];
              lane.high ^= M2i1;
              lane.low ^= M2i;
            }

            // Rounds
            for (var round = 0; round < 24; round++) {
              // Theta
              for (var x = 0; x < 5; x++) {
                // Mix column lanes
                var tMsw = 0,
                  tLsw = 0;
                for (var y = 0; y < 5; y++) {
                  var lane = state[x + 5 * y];
                  tMsw ^= lane.high;
                  tLsw ^= lane.low;
                }

                // Temporary values
                var Tx = T[x];
                Tx.high = tMsw;
                Tx.low = tLsw;
              }
              for (var x = 0; x < 5; x++) {
                // Shortcuts
                var Tx4 = T[(x + 4) % 5];
                var Tx1 = T[(x + 1) % 5];
                var Tx1Msw = Tx1.high;
                var Tx1Lsw = Tx1.low;

                // Mix surrounding columns
                var tMsw = Tx4.high ^ ((Tx1Msw << 1) | (Tx1Lsw >>> 31));
                var tLsw = Tx4.low ^ ((Tx1Lsw << 1) | (Tx1Msw >>> 31));
                for (var y = 0; y < 5; y++) {
                  var lane = state[x + 5 * y];
                  lane.high ^= tMsw;
                  lane.low ^= tLsw;
                }
              }

              // Rho Pi
              for (var laneIndex = 1; laneIndex < 25; laneIndex++) {
                var tMsw;
                var tLsw;

                // Shortcuts
                var lane = state[laneIndex];
                var laneMsw = lane.high;
                var laneLsw = lane.low;
                var rhoOffset = RHO_OFFSETS[laneIndex];

                // Rotate lanes
                if (rhoOffset < 32) {
                  tMsw =
                    (laneMsw << rhoOffset) | (laneLsw >>> (32 - rhoOffset));
                  tLsw =
                    (laneLsw << rhoOffset) | (laneMsw >>> (32 - rhoOffset));
                } /* if (rhoOffset >= 32) */ else {
                  tMsw =
                    (laneLsw << (rhoOffset - 32)) |
                    (laneMsw >>> (64 - rhoOffset));
                  tLsw =
                    (laneMsw << (rhoOffset - 32)) |
                    (laneLsw >>> (64 - rhoOffset));
                }

                // Transpose lanes
                var TPiLane = T[PI_INDEXES[laneIndex]];
                TPiLane.high = tMsw;
                TPiLane.low = tLsw;
              }

              // Rho pi at x = y = 0
              var T0 = T[0];
              var state0 = state[0];
              T0.high = state0.high;
              T0.low = state0.low;

              // Chi
              for (var x = 0; x < 5; x++) {
                for (var y = 0; y < 5; y++) {
                  // Shortcuts
                  var laneIndex = x + 5 * y;
                  var lane = state[laneIndex];
                  var TLane = T[laneIndex];
                  var Tx1Lane = T[((x + 1) % 5) + 5 * y];
                  var Tx2Lane = T[((x + 2) % 5) + 5 * y];

                  // Mix rows
                  lane.high = TLane.high ^ (~Tx1Lane.high & Tx2Lane.high);
                  lane.low = TLane.low ^ (~Tx1Lane.low & Tx2Lane.low);
                }
              }

              // Iota
              var lane = state[0];
              var roundConstant = ROUND_CONSTANTS[round];
              lane.high ^= roundConstant.high;
              lane.low ^= roundConstant.low;
            }
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;
            this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;
            var blockSizeBits = this.blockSize * 32;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x1 << (24 - (nBitsLeft % 32));
            dataWords[
              ((Math.ceil((nBitsLeft + 1) / blockSizeBits) * blockSizeBits) >>>
                5) -
                1
            ] |= 0x80;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Shortcuts
            var state = this._state;
            var outputLengthBytes = this.cfg.outputLength / 8;
            var outputLengthLanes = outputLengthBytes / 8;

            // Squeeze
            var hashWords = [];
            for (var i = 0; i < outputLengthLanes; i++) {
              // Shortcuts
              var lane = state[i];
              var laneMsw = lane.high;
              var laneLsw = lane.low;

              // Swap endian
              laneMsw =
                (((laneMsw << 8) | (laneMsw >>> 24)) & 0x00ff00ff) |
                (((laneMsw << 24) | (laneMsw >>> 8)) & 0xff00ff00);
              laneLsw =
                (((laneLsw << 8) | (laneLsw >>> 24)) & 0x00ff00ff) |
                (((laneLsw << 24) | (laneLsw >>> 8)) & 0xff00ff00);

              // Squeeze state to retrieve hash
              hashWords.push(laneLsw);
              hashWords.push(laneMsw);
            }

            // Return final computed hash
            return new WordArray.init(hashWords, outputLengthBytes);
          },

          clone: function () {
            var clone = Hasher.clone.call(this);

            var state = (clone._state = this._state.slice(0));
            for (var i = 0; i < 25; i++) {
              state[i] = state[i].clone();
            }

            return clone;
          },
        }));

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.SHA3('message');
         *     var hash = CryptoJS.SHA3(wordArray);
         */
        C.SHA3 = Hasher._createHelper(SHA3);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacSHA3(message, key);
         */
        C.HmacSHA3 = Hasher._createHmacHelper(SHA3);
      })(Math);

      return CryptoJS.SHA3;
    });
  })(sha3$1);
  return sha3$1.exports;
}

var ripemd160$1 = { exports: {} };

var ripemd160 = ripemd160$1.exports;

var hasRequiredRipemd160;

function requireRipemd160() {
  if (hasRequiredRipemd160) return ripemd160$1.exports;
  hasRequiredRipemd160 = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(ripemd160, function (CryptoJS) {
      /** @preserve
			(c) 2012 by Cédric Mesnil. All rights reserved.

			Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

			    - Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
			    - Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

			THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
			*/

      (function (Math) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;

        // Constants table
        var _zl = WordArray.create([
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10,
          6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7,
          0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5,
          6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
        ]);
        var _zr = WordArray.create([
          5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0,
          13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8,
          12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10,
          14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
        ]);
        var _sl = WordArray.create([
          11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13,
          11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13,
          15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5,
          6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5,
          6,
        ]);
        var _sr = WordArray.create([
          8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7,
          12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14,
          12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9,
          12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
        ]);

        var _hl = WordArray.create([
          0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e,
        ]);
        var _hr = WordArray.create([
          0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000,
        ]);

        /**
         * RIPEMD160 hash algorithm.
         */
        var RIPEMD160 = (C_algo.RIPEMD160 = Hasher.extend({
          _doReset: function () {
            this._hash = WordArray.create([
              0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
            ]);
          },

          _doProcessBlock: function (M, offset) {
            // Swap endian
            for (var i = 0; i < 16; i++) {
              // Shortcuts
              var offset_i = offset + i;
              var M_offset_i = M[offset_i];

              // Swap
              M[offset_i] =
                (((M_offset_i << 8) | (M_offset_i >>> 24)) & 0x00ff00ff) |
                (((M_offset_i << 24) | (M_offset_i >>> 8)) & 0xff00ff00);
            }
            // Shortcut
            var H = this._hash.words;
            var hl = _hl.words;
            var hr = _hr.words;
            var zl = _zl.words;
            var zr = _zr.words;
            var sl = _sl.words;
            var sr = _sr.words;

            // Working variables
            var al, bl, cl, dl, el;
            var ar, br, cr, dr, er;

            ar = al = H[0];
            br = bl = H[1];
            cr = cl = H[2];
            dr = dl = H[3];
            er = el = H[4];
            // Computation
            var t;
            for (var i = 0; i < 80; i += 1) {
              t = (al + M[offset + zl[i]]) | 0;
              if (i < 16) {
                t += f1(bl, cl, dl) + hl[0];
              } else if (i < 32) {
                t += f2(bl, cl, dl) + hl[1];
              } else if (i < 48) {
                t += f3(bl, cl, dl) + hl[2];
              } else if (i < 64) {
                t += f4(bl, cl, dl) + hl[3];
              } else {
                // if (i<80) {
                t += f5(bl, cl, dl) + hl[4];
              }
              t = t | 0;
              t = rotl(t, sl[i]);
              t = (t + el) | 0;
              al = el;
              el = dl;
              dl = rotl(cl, 10);
              cl = bl;
              bl = t;

              t = (ar + M[offset + zr[i]]) | 0;
              if (i < 16) {
                t += f5(br, cr, dr) + hr[0];
              } else if (i < 32) {
                t += f4(br, cr, dr) + hr[1];
              } else if (i < 48) {
                t += f3(br, cr, dr) + hr[2];
              } else if (i < 64) {
                t += f2(br, cr, dr) + hr[3];
              } else {
                // if (i<80) {
                t += f1(br, cr, dr) + hr[4];
              }
              t = t | 0;
              t = rotl(t, sr[i]);
              t = (t + er) | 0;
              ar = er;
              er = dr;
              dr = rotl(cr, 10);
              cr = br;
              br = t;
            }
            // Intermediate hash value
            t = (H[1] + cl + dr) | 0;
            H[1] = (H[2] + dl + er) | 0;
            H[2] = (H[3] + el + ar) | 0;
            H[3] = (H[4] + al + br) | 0;
            H[4] = (H[0] + bl + cr) | 0;
            H[0] = t;
          },

          _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] =
              (((nBitsTotal << 8) | (nBitsTotal >>> 24)) & 0x00ff00ff) |
              (((nBitsTotal << 24) | (nBitsTotal >>> 8)) & 0xff00ff00);
            data.sigBytes = (dataWords.length + 1) * 4;

            // Hash final blocks
            this._process();

            // Shortcuts
            var hash = this._hash;
            var H = hash.words;

            // Swap endian
            for (var i = 0; i < 5; i++) {
              // Shortcut
              var H_i = H[i];

              // Swap
              H[i] =
                (((H_i << 8) | (H_i >>> 24)) & 0x00ff00ff) |
                (((H_i << 24) | (H_i >>> 8)) & 0xff00ff00);
            }

            // Return final computed hash
            return hash;
          },

          clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          },
        }));

        function f1(x, y, z) {
          return x ^ y ^ z;
        }

        function f2(x, y, z) {
          return (x & y) | (~x & z);
        }

        function f3(x, y, z) {
          return (x | ~y) ^ z;
        }

        function f4(x, y, z) {
          return (x & z) | (y & ~z);
        }

        function f5(x, y, z) {
          return x ^ (y | ~z);
        }

        function rotl(x, n) {
          return (x << n) | (x >>> (32 - n));
        }

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.RIPEMD160('message');
         *     var hash = CryptoJS.RIPEMD160(wordArray);
         */
        C.RIPEMD160 = Hasher._createHelper(RIPEMD160);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacRIPEMD160(message, key);
         */
        C.HmacRIPEMD160 = Hasher._createHmacHelper(RIPEMD160);
      })();

      return CryptoJS.RIPEMD160;
    });
  })(ripemd160$1);
  return ripemd160$1.exports;
}

var hmac$1 = { exports: {} };

var hmac = hmac$1.exports;

var hasRequiredHmac;

function requireHmac() {
  if (hasRequiredHmac) return hmac$1.exports;
  hasRequiredHmac = 1;
  (function (module, exports) {
    (function (root, factory) {
      {
        // CommonJS
        module.exports = factory(requireCore());
      }
    })(hmac, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var C_enc = C.enc;
        var Utf8 = C_enc.Utf8;
        var C_algo = C.algo;

        /**
         * HMAC algorithm.
         */
        C_algo.HMAC = Base.extend({
          /**
           * Initializes a newly created HMAC.
           *
           * @param {Hasher} hasher The hash algorithm to use.
           * @param {WordArray|string} key The secret key.
           *
           * @example
           *
           *     var hmacHasher = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, key);
           */
          init: function (hasher, key) {
            // Init hasher
            hasher = this._hasher = new hasher.init();

            // Convert string to WordArray, else assume WordArray already
            if (typeof key == 'string') {
              key = Utf8.parse(key);
            }

            // Shortcuts
            var hasherBlockSize = hasher.blockSize;
            var hasherBlockSizeBytes = hasherBlockSize * 4;

            // Allow arbitrary length keys
            if (key.sigBytes > hasherBlockSizeBytes) {
              key = hasher.finalize(key);
            }

            // Clamp excess bits
            key.clamp();

            // Clone key for inner and outer pads
            var oKey = (this._oKey = key.clone());
            var iKey = (this._iKey = key.clone());

            // Shortcuts
            var oKeyWords = oKey.words;
            var iKeyWords = iKey.words;

            // XOR keys with pad constants
            for (var i = 0; i < hasherBlockSize; i++) {
              oKeyWords[i] ^= 0x5c5c5c5c;
              iKeyWords[i] ^= 0x36363636;
            }
            oKey.sigBytes = iKey.sigBytes = hasherBlockSizeBytes;

            // Set initial values
            this.reset();
          },

          /**
           * Resets this HMAC to its initial state.
           *
           * @example
           *
           *     hmacHasher.reset();
           */
          reset: function () {
            // Shortcut
            var hasher = this._hasher;

            // Reset
            hasher.reset();
            hasher.update(this._iKey);
          },

          /**
           * Updates this HMAC with a message.
           *
           * @param {WordArray|string} messageUpdate The message to append.
           *
           * @return {HMAC} This HMAC instance.
           *
           * @example
           *
           *     hmacHasher.update('message');
           *     hmacHasher.update(wordArray);
           */
          update: function (messageUpdate) {
            this._hasher.update(messageUpdate);

            // Chainable
            return this;
          },

          /**
           * Finalizes the HMAC computation.
           * Note that the finalize operation is effectively a destructive, read-once operation.
           *
           * @param {WordArray|string} messageUpdate (Optional) A final message update.
           *
           * @return {WordArray} The HMAC.
           *
           * @example
           *
           *     var hmac = hmacHasher.finalize();
           *     var hmac = hmacHasher.finalize('message');
           *     var hmac = hmacHasher.finalize(wordArray);
           */
          finalize: function (messageUpdate) {
            // Shortcut
            var hasher = this._hasher;

            // Compute HMAC
            var innerHash = hasher.finalize(messageUpdate);
            hasher.reset();
            var hmac = hasher.finalize(this._oKey.clone().concat(innerHash));

            return hmac;
          },
        });
      })();
    });
  })(hmac$1);
  return hmac$1.exports;
}

var pbkdf2$1 = { exports: {} };

var pbkdf2 = pbkdf2$1.exports;

var hasRequiredPbkdf2;

function requirePbkdf2() {
  if (hasRequiredPbkdf2) return pbkdf2$1.exports;
  hasRequiredPbkdf2 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireSha256(), requireHmac());
      }
    })(pbkdf2, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var WordArray = C_lib.WordArray;
        var C_algo = C.algo;
        var SHA256 = C_algo.SHA256;
        var HMAC = C_algo.HMAC;

        /**
         * Password-Based Key Derivation Function 2 algorithm.
         */
        var PBKDF2 = (C_algo.PBKDF2 = Base.extend({
          /**
           * Configuration options.
           *
           * @property {number} keySize The key size in words to generate. Default: 4 (128 bits)
           * @property {Hasher} hasher The hasher to use. Default: SHA256
           * @property {number} iterations The number of iterations to perform. Default: 250000
           */
          cfg: Base.extend({
            keySize: 128 / 32,
            hasher: SHA256,
            iterations: 250000,
          }),

          /**
           * Initializes a newly created key derivation function.
           *
           * @param {Object} cfg (Optional) The configuration options to use for the derivation.
           *
           * @example
           *
           *     var kdf = CryptoJS.algo.PBKDF2.create();
           *     var kdf = CryptoJS.algo.PBKDF2.create({ keySize: 8 });
           *     var kdf = CryptoJS.algo.PBKDF2.create({ keySize: 8, iterations: 1000 });
           */
          init: function (cfg) {
            this.cfg = this.cfg.extend(cfg);
          },

          /**
           * Computes the Password-Based Key Derivation Function 2.
           *
           * @param {WordArray|string} password The password.
           * @param {WordArray|string} salt A salt.
           *
           * @return {WordArray} The derived key.
           *
           * @example
           *
           *     var key = kdf.compute(password, salt);
           */
          compute: function (password, salt) {
            // Shortcut
            var cfg = this.cfg;

            // Init HMAC
            var hmac = HMAC.create(cfg.hasher, password);

            // Initial values
            var derivedKey = WordArray.create();
            var blockIndex = WordArray.create([0x00000001]);

            // Shortcuts
            var derivedKeyWords = derivedKey.words;
            var blockIndexWords = blockIndex.words;
            var keySize = cfg.keySize;
            var iterations = cfg.iterations;

            // Generate key
            while (derivedKeyWords.length < keySize) {
              var block = hmac.update(salt).finalize(blockIndex);
              hmac.reset();

              // Shortcuts
              var blockWords = block.words;
              var blockWordsLength = blockWords.length;

              // Iterations
              var intermediate = block;
              for (var i = 1; i < iterations; i++) {
                intermediate = hmac.finalize(intermediate);
                hmac.reset();

                // Shortcut
                var intermediateWords = intermediate.words;

                // XOR intermediate with block
                for (var j = 0; j < blockWordsLength; j++) {
                  blockWords[j] ^= intermediateWords[j];
                }
              }

              derivedKey.concat(block);
              blockIndexWords[0]++;
            }
            derivedKey.sigBytes = keySize * 4;

            return derivedKey;
          },
        }));

        /**
         * Computes the Password-Based Key Derivation Function 2.
         *
         * @param {WordArray|string} password The password.
         * @param {WordArray|string} salt A salt.
         * @param {Object} cfg (Optional) The configuration options to use for this computation.
         *
         * @return {WordArray} The derived key.
         *
         * @static
         *
         * @example
         *
         *     var key = CryptoJS.PBKDF2(password, salt);
         *     var key = CryptoJS.PBKDF2(password, salt, { keySize: 8 });
         *     var key = CryptoJS.PBKDF2(password, salt, { keySize: 8, iterations: 1000 });
         */
        C.PBKDF2 = function (password, salt, cfg) {
          return PBKDF2.create(cfg).compute(password, salt);
        };
      })();

      return CryptoJS.PBKDF2;
    });
  })(pbkdf2$1);
  return pbkdf2$1.exports;
}

var evpkdf$1 = { exports: {} };

var evpkdf = evpkdf$1.exports;

var hasRequiredEvpkdf;

function requireEvpkdf() {
  if (hasRequiredEvpkdf) return evpkdf$1.exports;
  hasRequiredEvpkdf = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireSha1(), requireHmac());
      }
    })(evpkdf, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var WordArray = C_lib.WordArray;
        var C_algo = C.algo;
        var MD5 = C_algo.MD5;

        /**
         * This key derivation function is meant to conform with EVP_BytesToKey.
         * www.openssl.org/docs/crypto/EVP_BytesToKey.html
         */
        var EvpKDF = (C_algo.EvpKDF = Base.extend({
          /**
           * Configuration options.
           *
           * @property {number} keySize The key size in words to generate. Default: 4 (128 bits)
           * @property {Hasher} hasher The hash algorithm to use. Default: MD5
           * @property {number} iterations The number of iterations to perform. Default: 1
           */
          cfg: Base.extend({
            keySize: 128 / 32,
            hasher: MD5,
            iterations: 1,
          }),

          /**
           * Initializes a newly created key derivation function.
           *
           * @param {Object} cfg (Optional) The configuration options to use for the derivation.
           *
           * @example
           *
           *     var kdf = CryptoJS.algo.EvpKDF.create();
           *     var kdf = CryptoJS.algo.EvpKDF.create({ keySize: 8 });
           *     var kdf = CryptoJS.algo.EvpKDF.create({ keySize: 8, iterations: 1000 });
           */
          init: function (cfg) {
            this.cfg = this.cfg.extend(cfg);
          },

          /**
           * Derives a key from a password.
           *
           * @param {WordArray|string} password The password.
           * @param {WordArray|string} salt A salt.
           *
           * @return {WordArray} The derived key.
           *
           * @example
           *
           *     var key = kdf.compute(password, salt);
           */
          compute: function (password, salt) {
            var block;

            // Shortcut
            var cfg = this.cfg;

            // Init hasher
            var hasher = cfg.hasher.create();

            // Initial values
            var derivedKey = WordArray.create();

            // Shortcuts
            var derivedKeyWords = derivedKey.words;
            var keySize = cfg.keySize;
            var iterations = cfg.iterations;

            // Generate key
            while (derivedKeyWords.length < keySize) {
              if (block) {
                hasher.update(block);
              }
              block = hasher.update(password).finalize(salt);
              hasher.reset();

              // Iterations
              for (var i = 1; i < iterations; i++) {
                block = hasher.finalize(block);
                hasher.reset();
              }

              derivedKey.concat(block);
            }
            derivedKey.sigBytes = keySize * 4;

            return derivedKey;
          },
        }));

        /**
         * Derives a key from a password.
         *
         * @param {WordArray|string} password The password.
         * @param {WordArray|string} salt A salt.
         * @param {Object} cfg (Optional) The configuration options to use for this computation.
         *
         * @return {WordArray} The derived key.
         *
         * @static
         *
         * @example
         *
         *     var key = CryptoJS.EvpKDF(password, salt);
         *     var key = CryptoJS.EvpKDF(password, salt, { keySize: 8 });
         *     var key = CryptoJS.EvpKDF(password, salt, { keySize: 8, iterations: 1000 });
         */
        C.EvpKDF = function (password, salt, cfg) {
          return EvpKDF.create(cfg).compute(password, salt);
        };
      })();

      return CryptoJS.EvpKDF;
    });
  })(evpkdf$1);
  return evpkdf$1.exports;
}

var cipherCore$1 = { exports: {} };

var cipherCore = cipherCore$1.exports;

var hasRequiredCipherCore;

function requireCipherCore() {
  if (hasRequiredCipherCore) return cipherCore$1.exports;
  hasRequiredCipherCore = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireEvpkdf());
      }
    })(cipherCore, function (CryptoJS) {
      /**
       * Cipher core components.
       */
      CryptoJS.lib.Cipher ||
        (function (undefined$1) {
          // Shortcuts
          var C = CryptoJS;
          var C_lib = C.lib;
          var Base = C_lib.Base;
          var WordArray = C_lib.WordArray;
          var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm;
          var C_enc = C.enc;
          C_enc.Utf8;
          var Base64 = C_enc.Base64;
          var C_algo = C.algo;
          var EvpKDF = C_algo.EvpKDF;

          /**
           * Abstract base cipher template.
           *
           * @property {number} keySize This cipher's key size. Default: 4 (128 bits)
           * @property {number} ivSize This cipher's IV size. Default: 4 (128 bits)
           * @property {number} _ENC_XFORM_MODE A constant representing encryption mode.
           * @property {number} _DEC_XFORM_MODE A constant representing decryption mode.
           */
          var Cipher = (C_lib.Cipher = BufferedBlockAlgorithm.extend({
            /**
             * Configuration options.
             *
             * @property {WordArray} iv The IV to use for this operation.
             */
            cfg: Base.extend(),

            /**
             * Creates this cipher in encryption mode.
             *
             * @param {WordArray} key The key.
             * @param {Object} cfg (Optional) The configuration options to use for this operation.
             *
             * @return {Cipher} A cipher instance.
             *
             * @static
             *
             * @example
             *
             *     var cipher = CryptoJS.algo.AES.createEncryptor(keyWordArray, { iv: ivWordArray });
             */
            createEncryptor: function (key, cfg) {
              return this.create(this._ENC_XFORM_MODE, key, cfg);
            },

            /**
             * Creates this cipher in decryption mode.
             *
             * @param {WordArray} key The key.
             * @param {Object} cfg (Optional) The configuration options to use for this operation.
             *
             * @return {Cipher} A cipher instance.
             *
             * @static
             *
             * @example
             *
             *     var cipher = CryptoJS.algo.AES.createDecryptor(keyWordArray, { iv: ivWordArray });
             */
            createDecryptor: function (key, cfg) {
              return this.create(this._DEC_XFORM_MODE, key, cfg);
            },

            /**
             * Initializes a newly created cipher.
             *
             * @param {number} xformMode Either the encryption or decryption transormation mode constant.
             * @param {WordArray} key The key.
             * @param {Object} cfg (Optional) The configuration options to use for this operation.
             *
             * @example
             *
             *     var cipher = CryptoJS.algo.AES.create(CryptoJS.algo.AES._ENC_XFORM_MODE, keyWordArray, { iv: ivWordArray });
             */
            init: function (xformMode, key, cfg) {
              // Apply config defaults
              this.cfg = this.cfg.extend(cfg);

              // Store transform mode and key
              this._xformMode = xformMode;
              this._key = key;

              // Set initial values
              this.reset();
            },

            /**
             * Resets this cipher to its initial state.
             *
             * @example
             *
             *     cipher.reset();
             */
            reset: function () {
              // Reset data buffer
              BufferedBlockAlgorithm.reset.call(this);

              // Perform concrete-cipher logic
              this._doReset();
            },

            /**
             * Adds data to be encrypted or decrypted.
             *
             * @param {WordArray|string} dataUpdate The data to encrypt or decrypt.
             *
             * @return {WordArray} The data after processing.
             *
             * @example
             *
             *     var encrypted = cipher.process('data');
             *     var encrypted = cipher.process(wordArray);
             */
            process: function (dataUpdate) {
              // Append
              this._append(dataUpdate);

              // Process available blocks
              return this._process();
            },

            /**
             * Finalizes the encryption or decryption process.
             * Note that the finalize operation is effectively a destructive, read-once operation.
             *
             * @param {WordArray|string} dataUpdate The final data to encrypt or decrypt.
             *
             * @return {WordArray} The data after final processing.
             *
             * @example
             *
             *     var encrypted = cipher.finalize();
             *     var encrypted = cipher.finalize('data');
             *     var encrypted = cipher.finalize(wordArray);
             */
            finalize: function (dataUpdate) {
              // Final data update
              if (dataUpdate) {
                this._append(dataUpdate);
              }

              // Perform concrete-cipher logic
              var finalProcessedData = this._doFinalize();

              return finalProcessedData;
            },

            keySize: 128 / 32,

            ivSize: 128 / 32,

            _ENC_XFORM_MODE: 1,

            _DEC_XFORM_MODE: 2,

            /**
             * Creates shortcut functions to a cipher's object interface.
             *
             * @param {Cipher} cipher The cipher to create a helper for.
             *
             * @return {Object} An object with encrypt and decrypt shortcut functions.
             *
             * @static
             *
             * @example
             *
             *     var AES = CryptoJS.lib.Cipher._createHelper(CryptoJS.algo.AES);
             */
            _createHelper: (function () {
              function selectCipherStrategy(key) {
                if (typeof key == 'string') {
                  return PasswordBasedCipher;
                } else {
                  return SerializableCipher;
                }
              }

              return function (cipher) {
                return {
                  encrypt: function (message, key, cfg) {
                    return selectCipherStrategy(key).encrypt(
                      cipher,
                      message,
                      key,
                      cfg
                    );
                  },

                  decrypt: function (ciphertext, key, cfg) {
                    return selectCipherStrategy(key).decrypt(
                      cipher,
                      ciphertext,
                      key,
                      cfg
                    );
                  },
                };
              };
            })(),
          }));

          /**
           * Abstract base stream cipher template.
           *
           * @property {number} blockSize The number of 32-bit words this cipher operates on. Default: 1 (32 bits)
           */
          C_lib.StreamCipher = Cipher.extend({
            _doFinalize: function () {
              // Process partial blocks
              var finalProcessedBlocks = this._process(!!'flush');

              return finalProcessedBlocks;
            },

            blockSize: 1,
          });

          /**
           * Mode namespace.
           */
          var C_mode = (C.mode = {});

          /**
           * Abstract base block cipher mode template.
           */
          var BlockCipherMode = (C_lib.BlockCipherMode = Base.extend({
            /**
             * Creates this mode for encryption.
             *
             * @param {Cipher} cipher A block cipher instance.
             * @param {Array} iv The IV words.
             *
             * @static
             *
             * @example
             *
             *     var mode = CryptoJS.mode.CBC.createEncryptor(cipher, iv.words);
             */
            createEncryptor: function (cipher, iv) {
              return this.Encryptor.create(cipher, iv);
            },

            /**
             * Creates this mode for decryption.
             *
             * @param {Cipher} cipher A block cipher instance.
             * @param {Array} iv The IV words.
             *
             * @static
             *
             * @example
             *
             *     var mode = CryptoJS.mode.CBC.createDecryptor(cipher, iv.words);
             */
            createDecryptor: function (cipher, iv) {
              return this.Decryptor.create(cipher, iv);
            },

            /**
             * Initializes a newly created mode.
             *
             * @param {Cipher} cipher A block cipher instance.
             * @param {Array} iv The IV words.
             *
             * @example
             *
             *     var mode = CryptoJS.mode.CBC.Encryptor.create(cipher, iv.words);
             */
            init: function (cipher, iv) {
              this._cipher = cipher;
              this._iv = iv;
            },
          }));

          /**
           * Cipher Block Chaining mode.
           */
          var CBC = (C_mode.CBC = (function () {
            /**
             * Abstract base CBC mode.
             */
            var CBC = BlockCipherMode.extend();

            /**
             * CBC encryptor.
             */
            CBC.Encryptor = CBC.extend({
              /**
               * Processes the data block at offset.
               *
               * @param {Array} words The data words to operate on.
               * @param {number} offset The offset where the block starts.
               *
               * @example
               *
               *     mode.processBlock(data.words, offset);
               */
              processBlock: function (words, offset) {
                // Shortcuts
                var cipher = this._cipher;
                var blockSize = cipher.blockSize;

                // XOR and encrypt
                xorBlock.call(this, words, offset, blockSize);
                cipher.encryptBlock(words, offset);

                // Remember this block to use with next block
                this._prevBlock = words.slice(offset, offset + blockSize);
              },
            });

            /**
             * CBC decryptor.
             */
            CBC.Decryptor = CBC.extend({
              /**
               * Processes the data block at offset.
               *
               * @param {Array} words The data words to operate on.
               * @param {number} offset The offset where the block starts.
               *
               * @example
               *
               *     mode.processBlock(data.words, offset);
               */
              processBlock: function (words, offset) {
                // Shortcuts
                var cipher = this._cipher;
                var blockSize = cipher.blockSize;

                // Remember this block to use with next block
                var thisBlock = words.slice(offset, offset + blockSize);

                // Decrypt and XOR
                cipher.decryptBlock(words, offset);
                xorBlock.call(this, words, offset, blockSize);

                // This block becomes the previous block
                this._prevBlock = thisBlock;
              },
            });

            function xorBlock(words, offset, blockSize) {
              var block;

              // Shortcut
              var iv = this._iv;

              // Choose mixing block
              if (iv) {
                block = iv;

                // Remove IV for subsequent blocks
                this._iv = undefined$1;
              } else {
                block = this._prevBlock;
              }

              // XOR blocks
              for (var i = 0; i < blockSize; i++) {
                words[offset + i] ^= block[i];
              }
            }

            return CBC;
          })());

          /**
           * Padding namespace.
           */
          var C_pad = (C.pad = {});

          /**
           * PKCS #5/7 padding strategy.
           */
          var Pkcs7 = (C_pad.Pkcs7 = {
            /**
             * Pads data using the algorithm defined in PKCS #5/7.
             *
             * @param {WordArray} data The data to pad.
             * @param {number} blockSize The multiple that the data should be padded to.
             *
             * @static
             *
             * @example
             *
             *     CryptoJS.pad.Pkcs7.pad(wordArray, 4);
             */
            pad: function (data, blockSize) {
              // Shortcut
              var blockSizeBytes = blockSize * 4;

              // Count padding bytes
              var nPaddingBytes =
                blockSizeBytes - (data.sigBytes % blockSizeBytes);

              // Create padding word
              var paddingWord =
                (nPaddingBytes << 24) |
                (nPaddingBytes << 16) |
                (nPaddingBytes << 8) |
                nPaddingBytes;

              // Create padding
              var paddingWords = [];
              for (var i = 0; i < nPaddingBytes; i += 4) {
                paddingWords.push(paddingWord);
              }
              var padding = WordArray.create(paddingWords, nPaddingBytes);

              // Add padding
              data.concat(padding);
            },

            /**
             * Unpads data that had been padded using the algorithm defined in PKCS #5/7.
             *
             * @param {WordArray} data The data to unpad.
             *
             * @static
             *
             * @example
             *
             *     CryptoJS.pad.Pkcs7.unpad(wordArray);
             */
            unpad: function (data) {
              // Get number of padding bytes from last byte
              var nPaddingBytes = data.words[(data.sigBytes - 1) >>> 2] & 0xff;

              // Remove padding
              data.sigBytes -= nPaddingBytes;
            },
          });

          /**
           * Abstract base block cipher template.
           *
           * @property {number} blockSize The number of 32-bit words this cipher operates on. Default: 4 (128 bits)
           */
          C_lib.BlockCipher = Cipher.extend({
            /**
             * Configuration options.
             *
             * @property {Mode} mode The block mode to use. Default: CBC
             * @property {Padding} padding The padding strategy to use. Default: Pkcs7
             */
            cfg: Cipher.cfg.extend({
              mode: CBC,
              padding: Pkcs7,
            }),

            reset: function () {
              var modeCreator;

              // Reset cipher
              Cipher.reset.call(this);

              // Shortcuts
              var cfg = this.cfg;
              var iv = cfg.iv;
              var mode = cfg.mode;

              // Reset block mode
              if (this._xformMode == this._ENC_XFORM_MODE) {
                modeCreator = mode.createEncryptor;
              } /* if (this._xformMode == this._DEC_XFORM_MODE) */ else {
                modeCreator = mode.createDecryptor;
                // Keep at least one block in the buffer for unpadding
                this._minBufferSize = 1;
              }

              if (this._mode && this._mode.__creator == modeCreator) {
                this._mode.init(this, iv && iv.words);
              } else {
                this._mode = modeCreator.call(mode, this, iv && iv.words);
                this._mode.__creator = modeCreator;
              }
            },

            _doProcessBlock: function (words, offset) {
              this._mode.processBlock(words, offset);
            },

            _doFinalize: function () {
              var finalProcessedBlocks;

              // Shortcut
              var padding = this.cfg.padding;

              // Finalize
              if (this._xformMode == this._ENC_XFORM_MODE) {
                // Pad data
                padding.pad(this._data, this.blockSize);

                // Process final blocks
                finalProcessedBlocks = this._process(!!'flush');
              } /* if (this._xformMode == this._DEC_XFORM_MODE) */ else {
                // Process final blocks
                finalProcessedBlocks = this._process(!!'flush');

                // Unpad data
                padding.unpad(finalProcessedBlocks);
              }

              return finalProcessedBlocks;
            },

            blockSize: 128 / 32,
          });

          /**
           * A collection of cipher parameters.
           *
           * @property {WordArray} ciphertext The raw ciphertext.
           * @property {WordArray} key The key to this ciphertext.
           * @property {WordArray} iv The IV used in the ciphering operation.
           * @property {WordArray} salt The salt used with a key derivation function.
           * @property {Cipher} algorithm The cipher algorithm.
           * @property {Mode} mode The block mode used in the ciphering operation.
           * @property {Padding} padding The padding scheme used in the ciphering operation.
           * @property {number} blockSize The block size of the cipher.
           * @property {Format} formatter The default formatting strategy to convert this cipher params object to a string.
           */
          var CipherParams = (C_lib.CipherParams = Base.extend({
            /**
             * Initializes a newly created cipher params object.
             *
             * @param {Object} cipherParams An object with any of the possible cipher parameters.
             *
             * @example
             *
             *     var cipherParams = CryptoJS.lib.CipherParams.create({
             *         ciphertext: ciphertextWordArray,
             *         key: keyWordArray,
             *         iv: ivWordArray,
             *         salt: saltWordArray,
             *         algorithm: CryptoJS.algo.AES,
             *         mode: CryptoJS.mode.CBC,
             *         padding: CryptoJS.pad.PKCS7,
             *         blockSize: 4,
             *         formatter: CryptoJS.format.OpenSSL
             *     });
             */
            init: function (cipherParams) {
              this.mixIn(cipherParams);
            },

            /**
             * Converts this cipher params object to a string.
             *
             * @param {Format} formatter (Optional) The formatting strategy to use.
             *
             * @return {string} The stringified cipher params.
             *
             * @throws Error If neither the formatter nor the default formatter is set.
             *
             * @example
             *
             *     var string = cipherParams + '';
             *     var string = cipherParams.toString();
             *     var string = cipherParams.toString(CryptoJS.format.OpenSSL);
             */
            toString: function (formatter) {
              return (formatter || this.formatter).stringify(this);
            },
          }));

          /**
           * Format namespace.
           */
          var C_format = (C.format = {});

          /**
           * OpenSSL formatting strategy.
           */
          var OpenSSLFormatter = (C_format.OpenSSL = {
            /**
             * Converts a cipher params object to an OpenSSL-compatible string.
             *
             * @param {CipherParams} cipherParams The cipher params object.
             *
             * @return {string} The OpenSSL-compatible string.
             *
             * @static
             *
             * @example
             *
             *     var openSSLString = CryptoJS.format.OpenSSL.stringify(cipherParams);
             */
            stringify: function (cipherParams) {
              var wordArray;

              // Shortcuts
              var ciphertext = cipherParams.ciphertext;
              var salt = cipherParams.salt;

              // Format
              if (salt) {
                wordArray = WordArray.create([0x53616c74, 0x65645f5f])
                  .concat(salt)
                  .concat(ciphertext);
              } else {
                wordArray = ciphertext;
              }

              return wordArray.toString(Base64);
            },

            /**
             * Converts an OpenSSL-compatible string to a cipher params object.
             *
             * @param {string} openSSLStr The OpenSSL-compatible string.
             *
             * @return {CipherParams} The cipher params object.
             *
             * @static
             *
             * @example
             *
             *     var cipherParams = CryptoJS.format.OpenSSL.parse(openSSLString);
             */
            parse: function (openSSLStr) {
              var salt;

              // Parse base64
              var ciphertext = Base64.parse(openSSLStr);

              // Shortcut
              var ciphertextWords = ciphertext.words;

              // Test for salt
              if (
                ciphertextWords[0] == 0x53616c74 &&
                ciphertextWords[1] == 0x65645f5f
              ) {
                // Extract salt
                salt = WordArray.create(ciphertextWords.slice(2, 4));

                // Remove salt from ciphertext
                ciphertextWords.splice(0, 4);
                ciphertext.sigBytes -= 16;
              }

              return CipherParams.create({
                ciphertext: ciphertext,
                salt: salt,
              });
            },
          });

          /**
           * A cipher wrapper that returns ciphertext as a serializable cipher params object.
           */
          var SerializableCipher = (C_lib.SerializableCipher = Base.extend({
            /**
             * Configuration options.
             *
             * @property {Formatter} format The formatting strategy to convert cipher param objects to and from a string. Default: OpenSSL
             */
            cfg: Base.extend({
              format: OpenSSLFormatter,
            }),

            /**
             * Encrypts a message.
             *
             * @param {Cipher} cipher The cipher algorithm to use.
             * @param {WordArray|string} message The message to encrypt.
             * @param {WordArray} key The key.
             * @param {Object} cfg (Optional) The configuration options to use for this operation.
             *
             * @return {CipherParams} A cipher params object.
             *
             * @static
             *
             * @example
             *
             *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key);
             *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key, { iv: iv });
             *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key, { iv: iv, format: CryptoJS.format.OpenSSL });
             */
            encrypt: function (cipher, message, key, cfg) {
              // Apply config defaults
              cfg = this.cfg.extend(cfg);

              // Encrypt
              var encryptor = cipher.createEncryptor(key, cfg);
              var ciphertext = encryptor.finalize(message);

              // Shortcut
              var cipherCfg = encryptor.cfg;

              // Create and return serializable cipher params
              return CipherParams.create({
                ciphertext: ciphertext,
                key: key,
                iv: cipherCfg.iv,
                algorithm: cipher,
                mode: cipherCfg.mode,
                padding: cipherCfg.padding,
                blockSize: cipher.blockSize,
                formatter: cfg.format,
              });
            },

            /**
             * Decrypts serialized ciphertext.
             *
             * @param {Cipher} cipher The cipher algorithm to use.
             * @param {CipherParams|string} ciphertext The ciphertext to decrypt.
             * @param {WordArray} key The key.
             * @param {Object} cfg (Optional) The configuration options to use for this operation.
             *
             * @return {WordArray} The plaintext.
             *
             * @static
             *
             * @example
             *
             *     var plaintext = CryptoJS.lib.SerializableCipher.decrypt(CryptoJS.algo.AES, formattedCiphertext, key, { iv: iv, format: CryptoJS.format.OpenSSL });
             *     var plaintext = CryptoJS.lib.SerializableCipher.decrypt(CryptoJS.algo.AES, ciphertextParams, key, { iv: iv, format: CryptoJS.format.OpenSSL });
             */
            decrypt: function (cipher, ciphertext, key, cfg) {
              // Apply config defaults
              cfg = this.cfg.extend(cfg);

              // Convert string to CipherParams
              ciphertext = this._parse(ciphertext, cfg.format);

              // Decrypt
              var plaintext = cipher
                .createDecryptor(key, cfg)
                .finalize(ciphertext.ciphertext);

              return plaintext;
            },

            /**
             * Converts serialized ciphertext to CipherParams,
             * else assumed CipherParams already and returns ciphertext unchanged.
             *
             * @param {CipherParams|string} ciphertext The ciphertext.
             * @param {Formatter} format The formatting strategy to use to parse serialized ciphertext.
             *
             * @return {CipherParams} The unserialized ciphertext.
             *
             * @static
             *
             * @example
             *
             *     var ciphertextParams = CryptoJS.lib.SerializableCipher._parse(ciphertextStringOrParams, format);
             */
            _parse: function (ciphertext, format) {
              if (typeof ciphertext == 'string') {
                return format.parse(ciphertext, this);
              } else {
                return ciphertext;
              }
            },
          }));

          /**
           * Key derivation function namespace.
           */
          var C_kdf = (C.kdf = {});

          /**
           * OpenSSL key derivation function.
           */
          var OpenSSLKdf = (C_kdf.OpenSSL = {
            /**
             * Derives a key and IV from a password.
             *
             * @param {string} password The password to derive from.
             * @param {number} keySize The size in words of the key to generate.
             * @param {number} ivSize The size in words of the IV to generate.
             * @param {WordArray|string} salt (Optional) A 64-bit salt to use. If omitted, a salt will be generated randomly.
             *
             * @return {CipherParams} A cipher params object with the key, IV, and salt.
             *
             * @static
             *
             * @example
             *
             *     var derivedParams = CryptoJS.kdf.OpenSSL.execute('Password', 256/32, 128/32);
             *     var derivedParams = CryptoJS.kdf.OpenSSL.execute('Password', 256/32, 128/32, 'saltsalt');
             */
            execute: function (password, keySize, ivSize, salt, hasher) {
              // Generate random salt
              if (!salt) {
                salt = WordArray.random(64 / 8);
              }

              // Derive key and IV
              if (!hasher) {
                var key = EvpKDF.create({ keySize: keySize + ivSize }).compute(
                  password,
                  salt
                );
              } else {
                var key = EvpKDF.create({
                  keySize: keySize + ivSize,
                  hasher: hasher,
                }).compute(password, salt);
              }

              // Separate key and IV
              var iv = WordArray.create(key.words.slice(keySize), ivSize * 4);
              key.sigBytes = keySize * 4;

              // Return params
              return CipherParams.create({ key: key, iv: iv, salt: salt });
            },
          });

          /**
           * A serializable cipher wrapper that derives the key from a password,
           * and returns ciphertext as a serializable cipher params object.
           */
          var PasswordBasedCipher = (C_lib.PasswordBasedCipher =
            SerializableCipher.extend({
              /**
               * Configuration options.
               *
               * @property {KDF} kdf The key derivation function to use to generate a key and IV from a password. Default: OpenSSL
               */
              cfg: SerializableCipher.cfg.extend({
                kdf: OpenSSLKdf,
              }),

              /**
               * Encrypts a message using a password.
               *
               * @param {Cipher} cipher The cipher algorithm to use.
               * @param {WordArray|string} message The message to encrypt.
               * @param {string} password The password.
               * @param {Object} cfg (Optional) The configuration options to use for this operation.
               *
               * @return {CipherParams} A cipher params object.
               *
               * @static
               *
               * @example
               *
               *     var ciphertextParams = CryptoJS.lib.PasswordBasedCipher.encrypt(CryptoJS.algo.AES, message, 'password');
               *     var ciphertextParams = CryptoJS.lib.PasswordBasedCipher.encrypt(CryptoJS.algo.AES, message, 'password', { format: CryptoJS.format.OpenSSL });
               */
              encrypt: function (cipher, message, password, cfg) {
                // Apply config defaults
                cfg = this.cfg.extend(cfg);

                // Derive key and other params
                var derivedParams = cfg.kdf.execute(
                  password,
                  cipher.keySize,
                  cipher.ivSize,
                  cfg.salt,
                  cfg.hasher
                );

                // Add IV to config
                cfg.iv = derivedParams.iv;

                // Encrypt
                var ciphertext = SerializableCipher.encrypt.call(
                  this,
                  cipher,
                  message,
                  derivedParams.key,
                  cfg
                );

                // Mix in derived params
                ciphertext.mixIn(derivedParams);

                return ciphertext;
              },

              /**
               * Decrypts serialized ciphertext using a password.
               *
               * @param {Cipher} cipher The cipher algorithm to use.
               * @param {CipherParams|string} ciphertext The ciphertext to decrypt.
               * @param {string} password The password.
               * @param {Object} cfg (Optional) The configuration options to use for this operation.
               *
               * @return {WordArray} The plaintext.
               *
               * @static
               *
               * @example
               *
               *     var plaintext = CryptoJS.lib.PasswordBasedCipher.decrypt(CryptoJS.algo.AES, formattedCiphertext, 'password', { format: CryptoJS.format.OpenSSL });
               *     var plaintext = CryptoJS.lib.PasswordBasedCipher.decrypt(CryptoJS.algo.AES, ciphertextParams, 'password', { format: CryptoJS.format.OpenSSL });
               */
              decrypt: function (cipher, ciphertext, password, cfg) {
                // Apply config defaults
                cfg = this.cfg.extend(cfg);

                // Convert string to CipherParams
                ciphertext = this._parse(ciphertext, cfg.format);

                // Derive key and other params
                var derivedParams = cfg.kdf.execute(
                  password,
                  cipher.keySize,
                  cipher.ivSize,
                  ciphertext.salt,
                  cfg.hasher
                );

                // Add IV to config
                cfg.iv = derivedParams.iv;

                // Decrypt
                var plaintext = SerializableCipher.decrypt.call(
                  this,
                  cipher,
                  ciphertext,
                  derivedParams.key,
                  cfg
                );

                return plaintext;
              },
            }));
        })();
    });
  })(cipherCore$1);
  return cipherCore$1.exports;
}

var modeCfb$1 = { exports: {} };

var modeCfb = modeCfb$1.exports;

var hasRequiredModeCfb;

function requireModeCfb() {
  if (hasRequiredModeCfb) return modeCfb$1.exports;
  hasRequiredModeCfb = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(modeCfb, function (CryptoJS) {
      /**
       * Cipher Feedback block mode.
       */
      CryptoJS.mode.CFB = (function () {
        var CFB = CryptoJS.lib.BlockCipherMode.extend();

        CFB.Encryptor = CFB.extend({
          processBlock: function (words, offset) {
            // Shortcuts
            var cipher = this._cipher;
            var blockSize = cipher.blockSize;

            generateKeystreamAndEncrypt.call(
              this,
              words,
              offset,
              blockSize,
              cipher
            );

            // Remember this block to use with next block
            this._prevBlock = words.slice(offset, offset + blockSize);
          },
        });

        CFB.Decryptor = CFB.extend({
          processBlock: function (words, offset) {
            // Shortcuts
            var cipher = this._cipher;
            var blockSize = cipher.blockSize;

            // Remember this block to use with next block
            var thisBlock = words.slice(offset, offset + blockSize);

            generateKeystreamAndEncrypt.call(
              this,
              words,
              offset,
              blockSize,
              cipher
            );

            // This block becomes the previous block
            this._prevBlock = thisBlock;
          },
        });

        function generateKeystreamAndEncrypt(words, offset, blockSize, cipher) {
          var keystream;

          // Shortcut
          var iv = this._iv;

          // Generate keystream
          if (iv) {
            keystream = iv.slice(0);

            // Remove IV for subsequent blocks
            this._iv = undefined;
          } else {
            keystream = this._prevBlock;
          }
          cipher.encryptBlock(keystream, 0);

          // Encrypt
          for (var i = 0; i < blockSize; i++) {
            words[offset + i] ^= keystream[i];
          }
        }

        return CFB;
      })();

      return CryptoJS.mode.CFB;
    });
  })(modeCfb$1);
  return modeCfb$1.exports;
}

var modeCtr$1 = { exports: {} };

var modeCtr = modeCtr$1.exports;

var hasRequiredModeCtr;

function requireModeCtr() {
  if (hasRequiredModeCtr) return modeCtr$1.exports;
  hasRequiredModeCtr = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(modeCtr, function (CryptoJS) {
      /**
       * Counter block mode.
       */
      CryptoJS.mode.CTR = (function () {
        var CTR = CryptoJS.lib.BlockCipherMode.extend();

        var Encryptor = (CTR.Encryptor = CTR.extend({
          processBlock: function (words, offset) {
            // Shortcuts
            var cipher = this._cipher;
            var blockSize = cipher.blockSize;
            var iv = this._iv;
            var counter = this._counter;

            // Generate keystream
            if (iv) {
              counter = this._counter = iv.slice(0);

              // Remove IV for subsequent blocks
              this._iv = undefined;
            }
            var keystream = counter.slice(0);
            cipher.encryptBlock(keystream, 0);

            // Increment counter
            counter[blockSize - 1] = (counter[blockSize - 1] + 1) | 0;

            // Encrypt
            for (var i = 0; i < blockSize; i++) {
              words[offset + i] ^= keystream[i];
            }
          },
        }));

        CTR.Decryptor = Encryptor;

        return CTR;
      })();

      return CryptoJS.mode.CTR;
    });
  })(modeCtr$1);
  return modeCtr$1.exports;
}

var modeCtrGladman$1 = { exports: {} };

var modeCtrGladman = modeCtrGladman$1.exports;

var hasRequiredModeCtrGladman;

function requireModeCtrGladman() {
  if (hasRequiredModeCtrGladman) return modeCtrGladman$1.exports;
  hasRequiredModeCtrGladman = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(modeCtrGladman, function (CryptoJS) {
      /** @preserve
       * Counter block mode compatible with  Dr Brian Gladman fileenc.c
       * derived from CryptoJS.mode.CTR
       * Jan Hruby jhruby.web@gmail.com
       */
      CryptoJS.mode.CTRGladman = (function () {
        var CTRGladman = CryptoJS.lib.BlockCipherMode.extend();

        function incWord(word) {
          if (((word >> 24) & 0xff) === 0xff) {
            //overflow
            var b1 = (word >> 16) & 0xff;
            var b2 = (word >> 8) & 0xff;
            var b3 = word & 0xff;

            if (b1 === 0xff) {
              // overflow b1
              b1 = 0;
              if (b2 === 0xff) {
                b2 = 0;
                if (b3 === 0xff) {
                  b3 = 0;
                } else {
                  ++b3;
                }
              } else {
                ++b2;
              }
            } else {
              ++b1;
            }

            word = 0;
            word += b1 << 16;
            word += b2 << 8;
            word += b3;
          } else {
            word += 0x01 << 24;
          }
          return word;
        }

        function incCounter(counter) {
          if ((counter[0] = incWord(counter[0])) === 0) {
            // encr_data in fileenc.c from  Dr Brian Gladman's counts only with DWORD j < 8
            counter[1] = incWord(counter[1]);
          }
          return counter;
        }

        var Encryptor = (CTRGladman.Encryptor = CTRGladman.extend({
          processBlock: function (words, offset) {
            // Shortcuts
            var cipher = this._cipher;
            var blockSize = cipher.blockSize;
            var iv = this._iv;
            var counter = this._counter;

            // Generate keystream
            if (iv) {
              counter = this._counter = iv.slice(0);

              // Remove IV for subsequent blocks
              this._iv = undefined;
            }

            incCounter(counter);

            var keystream = counter.slice(0);
            cipher.encryptBlock(keystream, 0);

            // Encrypt
            for (var i = 0; i < blockSize; i++) {
              words[offset + i] ^= keystream[i];
            }
          },
        }));

        CTRGladman.Decryptor = Encryptor;

        return CTRGladman;
      })();

      return CryptoJS.mode.CTRGladman;
    });
  })(modeCtrGladman$1);
  return modeCtrGladman$1.exports;
}

var modeOfb$1 = { exports: {} };

var modeOfb = modeOfb$1.exports;

var hasRequiredModeOfb;

function requireModeOfb() {
  if (hasRequiredModeOfb) return modeOfb$1.exports;
  hasRequiredModeOfb = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(modeOfb, function (CryptoJS) {
      /**
       * Output Feedback block mode.
       */
      CryptoJS.mode.OFB = (function () {
        var OFB = CryptoJS.lib.BlockCipherMode.extend();

        var Encryptor = (OFB.Encryptor = OFB.extend({
          processBlock: function (words, offset) {
            // Shortcuts
            var cipher = this._cipher;
            var blockSize = cipher.blockSize;
            var iv = this._iv;
            var keystream = this._keystream;

            // Generate keystream
            if (iv) {
              keystream = this._keystream = iv.slice(0);

              // Remove IV for subsequent blocks
              this._iv = undefined;
            }
            cipher.encryptBlock(keystream, 0);

            // Encrypt
            for (var i = 0; i < blockSize; i++) {
              words[offset + i] ^= keystream[i];
            }
          },
        }));

        OFB.Decryptor = Encryptor;

        return OFB;
      })();

      return CryptoJS.mode.OFB;
    });
  })(modeOfb$1);
  return modeOfb$1.exports;
}

var modeEcb$1 = { exports: {} };

var modeEcb = modeEcb$1.exports;

var hasRequiredModeEcb;

function requireModeEcb() {
  if (hasRequiredModeEcb) return modeEcb$1.exports;
  hasRequiredModeEcb = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(modeEcb, function (CryptoJS) {
      /**
       * Electronic Codebook block mode.
       */
      CryptoJS.mode.ECB = (function () {
        var ECB = CryptoJS.lib.BlockCipherMode.extend();

        ECB.Encryptor = ECB.extend({
          processBlock: function (words, offset) {
            this._cipher.encryptBlock(words, offset);
          },
        });

        ECB.Decryptor = ECB.extend({
          processBlock: function (words, offset) {
            this._cipher.decryptBlock(words, offset);
          },
        });

        return ECB;
      })();

      return CryptoJS.mode.ECB;
    });
  })(modeEcb$1);
  return modeEcb$1.exports;
}

var padAnsix923$1 = { exports: {} };

var padAnsix923 = padAnsix923$1.exports;

var hasRequiredPadAnsix923;

function requirePadAnsix923() {
  if (hasRequiredPadAnsix923) return padAnsix923$1.exports;
  hasRequiredPadAnsix923 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(padAnsix923, function (CryptoJS) {
      /**
       * ANSI X.923 padding strategy.
       */
      CryptoJS.pad.AnsiX923 = {
        pad: function (data, blockSize) {
          // Shortcuts
          var dataSigBytes = data.sigBytes;
          var blockSizeBytes = blockSize * 4;

          // Count padding bytes
          var nPaddingBytes = blockSizeBytes - (dataSigBytes % blockSizeBytes);

          // Compute last byte position
          var lastBytePos = dataSigBytes + nPaddingBytes - 1;

          // Pad
          data.clamp();
          data.words[lastBytePos >>> 2] |=
            nPaddingBytes << (24 - (lastBytePos % 4) * 8);
          data.sigBytes += nPaddingBytes;
        },

        unpad: function (data) {
          // Get number of padding bytes from last byte
          var nPaddingBytes = data.words[(data.sigBytes - 1) >>> 2] & 0xff;

          // Remove padding
          data.sigBytes -= nPaddingBytes;
        },
      };

      return CryptoJS.pad.Ansix923;
    });
  })(padAnsix923$1);
  return padAnsix923$1.exports;
}

var padIso10126$1 = { exports: {} };

var padIso10126 = padIso10126$1.exports;

var hasRequiredPadIso10126;

function requirePadIso10126() {
  if (hasRequiredPadIso10126) return padIso10126$1.exports;
  hasRequiredPadIso10126 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(padIso10126, function (CryptoJS) {
      /**
       * ISO 10126 padding strategy.
       */
      CryptoJS.pad.Iso10126 = {
        pad: function (data, blockSize) {
          // Shortcut
          var blockSizeBytes = blockSize * 4;

          // Count padding bytes
          var nPaddingBytes = blockSizeBytes - (data.sigBytes % blockSizeBytes);

          // Pad
          data
            .concat(CryptoJS.lib.WordArray.random(nPaddingBytes - 1))
            .concat(CryptoJS.lib.WordArray.create([nPaddingBytes << 24], 1));
        },

        unpad: function (data) {
          // Get number of padding bytes from last byte
          var nPaddingBytes = data.words[(data.sigBytes - 1) >>> 2] & 0xff;

          // Remove padding
          data.sigBytes -= nPaddingBytes;
        },
      };

      return CryptoJS.pad.Iso10126;
    });
  })(padIso10126$1);
  return padIso10126$1.exports;
}

var padIso97971$1 = { exports: {} };

var padIso97971 = padIso97971$1.exports;

var hasRequiredPadIso97971;

function requirePadIso97971() {
  if (hasRequiredPadIso97971) return padIso97971$1.exports;
  hasRequiredPadIso97971 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(padIso97971, function (CryptoJS) {
      /**
       * ISO/IEC 9797-1 Padding Method 2.
       */
      CryptoJS.pad.Iso97971 = {
        pad: function (data, blockSize) {
          // Add 0x80 byte
          data.concat(CryptoJS.lib.WordArray.create([0x80000000], 1));

          // Zero pad the rest
          CryptoJS.pad.ZeroPadding.pad(data, blockSize);
        },

        unpad: function (data) {
          // Remove zero padding
          CryptoJS.pad.ZeroPadding.unpad(data);

          // Remove one more byte -- the 0x80 byte
          data.sigBytes--;
        },
      };

      return CryptoJS.pad.Iso97971;
    });
  })(padIso97971$1);
  return padIso97971$1.exports;
}

var padZeropadding$1 = { exports: {} };

var padZeropadding = padZeropadding$1.exports;

var hasRequiredPadZeropadding;

function requirePadZeropadding() {
  if (hasRequiredPadZeropadding) return padZeropadding$1.exports;
  hasRequiredPadZeropadding = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(padZeropadding, function (CryptoJS) {
      /**
       * Zero padding strategy.
       */
      CryptoJS.pad.ZeroPadding = {
        pad: function (data, blockSize) {
          // Shortcut
          var blockSizeBytes = blockSize * 4;

          // Pad
          data.clamp();
          data.sigBytes +=
            blockSizeBytes - (data.sigBytes % blockSizeBytes || blockSizeBytes);
        },

        unpad: function (data) {
          // Shortcut
          var dataWords = data.words;

          // Unpad
          var i = data.sigBytes - 1;
          for (var i = data.sigBytes - 1; i >= 0; i--) {
            if ((dataWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff) {
              data.sigBytes = i + 1;
              break;
            }
          }
        },
      };

      return CryptoJS.pad.ZeroPadding;
    });
  })(padZeropadding$1);
  return padZeropadding$1.exports;
}

var padNopadding$1 = { exports: {} };

var padNopadding = padNopadding$1.exports;

var hasRequiredPadNopadding;

function requirePadNopadding() {
  if (hasRequiredPadNopadding) return padNopadding$1.exports;
  hasRequiredPadNopadding = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(padNopadding, function (CryptoJS) {
      /**
       * A noop padding strategy.
       */
      CryptoJS.pad.NoPadding = {
        pad: function () {},

        unpad: function () {},
      };

      return CryptoJS.pad.NoPadding;
    });
  })(padNopadding$1);
  return padNopadding$1.exports;
}

var formatHex$1 = { exports: {} };

var formatHex = formatHex$1.exports;

var hasRequiredFormatHex;

function requireFormatHex() {
  if (hasRequiredFormatHex) return formatHex$1.exports;
  hasRequiredFormatHex = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(requireCore(), requireCipherCore());
      }
    })(formatHex, function (CryptoJS) {
      (function (undefined$1) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var CipherParams = C_lib.CipherParams;
        var C_enc = C.enc;
        var Hex = C_enc.Hex;
        var C_format = C.format;

        C_format.Hex = {
          /**
           * Converts the ciphertext of a cipher params object to a hexadecimally encoded string.
           *
           * @param {CipherParams} cipherParams The cipher params object.
           *
           * @return {string} The hexadecimally encoded string.
           *
           * @static
           *
           * @example
           *
           *     var hexString = CryptoJS.format.Hex.stringify(cipherParams);
           */
          stringify: function (cipherParams) {
            return cipherParams.ciphertext.toString(Hex);
          },

          /**
           * Converts a hexadecimally encoded ciphertext string to a cipher params object.
           *
           * @param {string} input The hexadecimally encoded string.
           *
           * @return {CipherParams} The cipher params object.
           *
           * @static
           *
           * @example
           *
           *     var cipherParams = CryptoJS.format.Hex.parse(hexString);
           */
          parse: function (input) {
            var ciphertext = Hex.parse(input);
            return CipherParams.create({ ciphertext: ciphertext });
          },
        };
      })();

      return CryptoJS.format.Hex;
    });
  })(formatHex$1);
  return formatHex$1.exports;
}

var aes$1 = { exports: {} };

var aes = aes$1.exports;

var hasRequiredAes;

function requireAes() {
  if (hasRequiredAes) return aes$1.exports;
  hasRequiredAes = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(aes, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var BlockCipher = C_lib.BlockCipher;
        var C_algo = C.algo;

        // Lookup tables
        var SBOX = [];
        var INV_SBOX = [];
        var SUB_MIX_0 = [];
        var SUB_MIX_1 = [];
        var SUB_MIX_2 = [];
        var SUB_MIX_3 = [];
        var INV_SUB_MIX_0 = [];
        var INV_SUB_MIX_1 = [];
        var INV_SUB_MIX_2 = [];
        var INV_SUB_MIX_3 = [];

        // Compute lookup tables
        (function () {
          // Compute double table
          var d = [];
          for (var i = 0; i < 256; i++) {
            if (i < 128) {
              d[i] = i << 1;
            } else {
              d[i] = (i << 1) ^ 0x11b;
            }
          }

          // Walk GF(2^8)
          var x = 0;
          var xi = 0;
          for (var i = 0; i < 256; i++) {
            // Compute sbox
            var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
            sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
            SBOX[x] = sx;
            INV_SBOX[sx] = x;

            // Compute multiplication
            var x2 = d[x];
            var x4 = d[x2];
            var x8 = d[x4];

            // Compute sub bytes, mix columns tables
            var t = (d[sx] * 0x101) ^ (sx * 0x1010100);
            SUB_MIX_0[x] = (t << 24) | (t >>> 8);
            SUB_MIX_1[x] = (t << 16) | (t >>> 16);
            SUB_MIX_2[x] = (t << 8) | (t >>> 24);
            SUB_MIX_3[x] = t;

            // Compute inv sub bytes, inv mix columns tables
            var t =
              (x8 * 0x1010101) ^
              (x4 * 0x10001) ^
              (x2 * 0x101) ^
              (x * 0x1010100);
            INV_SUB_MIX_0[sx] = (t << 24) | (t >>> 8);
            INV_SUB_MIX_1[sx] = (t << 16) | (t >>> 16);
            INV_SUB_MIX_2[sx] = (t << 8) | (t >>> 24);
            INV_SUB_MIX_3[sx] = t;

            // Compute next counter
            if (!x) {
              x = xi = 1;
            } else {
              x = x2 ^ d[d[d[x8 ^ x2]]];
              xi ^= d[d[xi]];
            }
          }
        })();

        // Precomputed Rcon lookup
        var RCON = [
          0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36,
        ];

        /**
         * AES block cipher algorithm.
         */
        var AES = (C_algo.AES = BlockCipher.extend({
          _doReset: function () {
            var t;

            // Skip reset of nRounds has been set before and key did not change
            if (this._nRounds && this._keyPriorReset === this._key) {
              return;
            }

            // Shortcuts
            var key = (this._keyPriorReset = this._key);
            var keyWords = key.words;
            var keySize = key.sigBytes / 4;

            // Compute number of rounds
            var nRounds = (this._nRounds = keySize + 6);

            // Compute number of key schedule rows
            var ksRows = (nRounds + 1) * 4;

            // Compute key schedule
            var keySchedule = (this._keySchedule = []);
            for (var ksRow = 0; ksRow < ksRows; ksRow++) {
              if (ksRow < keySize) {
                keySchedule[ksRow] = keyWords[ksRow];
              } else {
                t = keySchedule[ksRow - 1];

                if (!(ksRow % keySize)) {
                  // Rot word
                  t = (t << 8) | (t >>> 24);

                  // Sub word
                  t =
                    (SBOX[t >>> 24] << 24) |
                    (SBOX[(t >>> 16) & 0xff] << 16) |
                    (SBOX[(t >>> 8) & 0xff] << 8) |
                    SBOX[t & 0xff];

                  // Mix Rcon
                  t ^= RCON[(ksRow / keySize) | 0] << 24;
                } else if (keySize > 6 && ksRow % keySize == 4) {
                  // Sub word
                  t =
                    (SBOX[t >>> 24] << 24) |
                    (SBOX[(t >>> 16) & 0xff] << 16) |
                    (SBOX[(t >>> 8) & 0xff] << 8) |
                    SBOX[t & 0xff];
                }

                keySchedule[ksRow] = keySchedule[ksRow - keySize] ^ t;
              }
            }

            // Compute inv key schedule
            var invKeySchedule = (this._invKeySchedule = []);
            for (var invKsRow = 0; invKsRow < ksRows; invKsRow++) {
              var ksRow = ksRows - invKsRow;

              if (invKsRow % 4) {
                var t = keySchedule[ksRow];
              } else {
                var t = keySchedule[ksRow - 4];
              }

              if (invKsRow < 4 || ksRow <= 4) {
                invKeySchedule[invKsRow] = t;
              } else {
                invKeySchedule[invKsRow] =
                  INV_SUB_MIX_0[SBOX[t >>> 24]] ^
                  INV_SUB_MIX_1[SBOX[(t >>> 16) & 0xff]] ^
                  INV_SUB_MIX_2[SBOX[(t >>> 8) & 0xff]] ^
                  INV_SUB_MIX_3[SBOX[t & 0xff]];
              }
            }
          },

          encryptBlock: function (M, offset) {
            this._doCryptBlock(
              M,
              offset,
              this._keySchedule,
              SUB_MIX_0,
              SUB_MIX_1,
              SUB_MIX_2,
              SUB_MIX_3,
              SBOX
            );
          },

          decryptBlock: function (M, offset) {
            // Swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;

            this._doCryptBlock(
              M,
              offset,
              this._invKeySchedule,
              INV_SUB_MIX_0,
              INV_SUB_MIX_1,
              INV_SUB_MIX_2,
              INV_SUB_MIX_3,
              INV_SBOX
            );

            // Inv swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;
          },

          _doCryptBlock: function (
            M,
            offset,
            keySchedule,
            SUB_MIX_0,
            SUB_MIX_1,
            SUB_MIX_2,
            SUB_MIX_3,
            SBOX
          ) {
            // Shortcut
            var nRounds = this._nRounds;

            // Get input, add round key
            var s0 = M[offset] ^ keySchedule[0];
            var s1 = M[offset + 1] ^ keySchedule[1];
            var s2 = M[offset + 2] ^ keySchedule[2];
            var s3 = M[offset + 3] ^ keySchedule[3];

            // Key schedule row counter
            var ksRow = 4;

            // Rounds
            for (var round = 1; round < nRounds; round++) {
              // Shift rows, sub bytes, mix columns, add round key
              var t0 =
                SUB_MIX_0[s0 >>> 24] ^
                SUB_MIX_1[(s1 >>> 16) & 0xff] ^
                SUB_MIX_2[(s2 >>> 8) & 0xff] ^
                SUB_MIX_3[s3 & 0xff] ^
                keySchedule[ksRow++];
              var t1 =
                SUB_MIX_0[s1 >>> 24] ^
                SUB_MIX_1[(s2 >>> 16) & 0xff] ^
                SUB_MIX_2[(s3 >>> 8) & 0xff] ^
                SUB_MIX_3[s0 & 0xff] ^
                keySchedule[ksRow++];
              var t2 =
                SUB_MIX_0[s2 >>> 24] ^
                SUB_MIX_1[(s3 >>> 16) & 0xff] ^
                SUB_MIX_2[(s0 >>> 8) & 0xff] ^
                SUB_MIX_3[s1 & 0xff] ^
                keySchedule[ksRow++];
              var t3 =
                SUB_MIX_0[s3 >>> 24] ^
                SUB_MIX_1[(s0 >>> 16) & 0xff] ^
                SUB_MIX_2[(s1 >>> 8) & 0xff] ^
                SUB_MIX_3[s2 & 0xff] ^
                keySchedule[ksRow++];

              // Update state
              s0 = t0;
              s1 = t1;
              s2 = t2;
              s3 = t3;
            }

            // Shift rows, sub bytes, add round key
            var t0 =
              ((SBOX[s0 >>> 24] << 24) |
                (SBOX[(s1 >>> 16) & 0xff] << 16) |
                (SBOX[(s2 >>> 8) & 0xff] << 8) |
                SBOX[s3 & 0xff]) ^
              keySchedule[ksRow++];
            var t1 =
              ((SBOX[s1 >>> 24] << 24) |
                (SBOX[(s2 >>> 16) & 0xff] << 16) |
                (SBOX[(s3 >>> 8) & 0xff] << 8) |
                SBOX[s0 & 0xff]) ^
              keySchedule[ksRow++];
            var t2 =
              ((SBOX[s2 >>> 24] << 24) |
                (SBOX[(s3 >>> 16) & 0xff] << 16) |
                (SBOX[(s0 >>> 8) & 0xff] << 8) |
                SBOX[s1 & 0xff]) ^
              keySchedule[ksRow++];
            var t3 =
              ((SBOX[s3 >>> 24] << 24) |
                (SBOX[(s0 >>> 16) & 0xff] << 16) |
                (SBOX[(s1 >>> 8) & 0xff] << 8) |
                SBOX[s2 & 0xff]) ^
              keySchedule[ksRow++];

            // Set output
            M[offset] = t0;
            M[offset + 1] = t1;
            M[offset + 2] = t2;
            M[offset + 3] = t3;
          },

          keySize: 256 / 32,
        }));

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.AES.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.AES.decrypt(ciphertext, key, cfg);
         */
        C.AES = BlockCipher._createHelper(AES);
      })();

      return CryptoJS.AES;
    });
  })(aes$1);
  return aes$1.exports;
}

var tripledes$1 = { exports: {} };

var tripledes = tripledes$1.exports;

var hasRequiredTripledes;

function requireTripledes() {
  if (hasRequiredTripledes) return tripledes$1.exports;
  hasRequiredTripledes = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(tripledes, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var BlockCipher = C_lib.BlockCipher;
        var C_algo = C.algo;

        // Permuted Choice 1 constants
        var PC1 = [
          57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51,
          43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7,
          62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20,
          12, 4,
        ];

        // Permuted Choice 2 constants
        var PC2 = [
          14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16,
          7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44,
          49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
        ];

        // Cumulative bit shift constants
        var BIT_SHIFTS = [
          1, 2, 4, 6, 8, 10, 12, 14, 15, 17, 19, 21, 23, 25, 27, 28,
        ];

        // SBOXes and round permutation constants
        var SBOX_P = [
          {
            0x0: 0x808200,
            0x10000000: 0x8000,
            0x20000000: 0x808002,
            0x30000000: 0x2,
            0x40000000: 0x200,
            0x50000000: 0x808202,
            0x60000000: 0x800202,
            0x70000000: 0x800000,
            0x80000000: 0x202,
            0x90000000: 0x800200,
            0xa0000000: 0x8200,
            0xb0000000: 0x808000,
            0xc0000000: 0x8002,
            0xd0000000: 0x800002,
            0xe0000000: 0x0,
            0xf0000000: 0x8202,
            0x8000000: 0x0,
            0x18000000: 0x808202,
            0x28000000: 0x8202,
            0x38000000: 0x8000,
            0x48000000: 0x808200,
            0x58000000: 0x200,
            0x68000000: 0x808002,
            0x78000000: 0x2,
            0x88000000: 0x800200,
            0x98000000: 0x8200,
            0xa8000000: 0x808000,
            0xb8000000: 0x800202,
            0xc8000000: 0x800002,
            0xd8000000: 0x8002,
            0xe8000000: 0x202,
            0xf8000000: 0x800000,
            0x1: 0x8000,
            0x10000001: 0x2,
            0x20000001: 0x808200,
            0x30000001: 0x800000,
            0x40000001: 0x808002,
            0x50000001: 0x8200,
            0x60000001: 0x200,
            0x70000001: 0x800202,
            0x80000001: 0x808202,
            0x90000001: 0x808000,
            0xa0000001: 0x800002,
            0xb0000001: 0x8202,
            0xc0000001: 0x202,
            0xd0000001: 0x800200,
            0xe0000001: 0x8002,
            0xf0000001: 0x0,
            0x8000001: 0x808202,
            0x18000001: 0x808000,
            0x28000001: 0x800000,
            0x38000001: 0x200,
            0x48000001: 0x8000,
            0x58000001: 0x800002,
            0x68000001: 0x2,
            0x78000001: 0x8202,
            0x88000001: 0x8002,
            0x98000001: 0x800202,
            0xa8000001: 0x202,
            0xb8000001: 0x808200,
            0xc8000001: 0x800200,
            0xd8000001: 0x0,
            0xe8000001: 0x8200,
            0xf8000001: 0x808002,
          },
          {
            0x0: 0x40084010,
            0x1000000: 0x4000,
            0x2000000: 0x80000,
            0x3000000: 0x40080010,
            0x4000000: 0x40000010,
            0x5000000: 0x40084000,
            0x6000000: 0x40004000,
            0x7000000: 0x10,
            0x8000000: 0x84000,
            0x9000000: 0x40004010,
            0xa000000: 0x40000000,
            0xb000000: 0x84010,
            0xc000000: 0x80010,
            0xd000000: 0x0,
            0xe000000: 0x4010,
            0xf000000: 0x40080000,
            0x800000: 0x40004000,
            0x1800000: 0x84010,
            0x2800000: 0x10,
            0x3800000: 0x40004010,
            0x4800000: 0x40084010,
            0x5800000: 0x40000000,
            0x6800000: 0x80000,
            0x7800000: 0x40080010,
            0x8800000: 0x80010,
            0x9800000: 0x0,
            0xa800000: 0x4000,
            0xb800000: 0x40080000,
            0xc800000: 0x40000010,
            0xd800000: 0x84000,
            0xe800000: 0x40084000,
            0xf800000: 0x4010,
            0x10000000: 0x0,
            0x11000000: 0x40080010,
            0x12000000: 0x40004010,
            0x13000000: 0x40084000,
            0x14000000: 0x40080000,
            0x15000000: 0x10,
            0x16000000: 0x84010,
            0x17000000: 0x4000,
            0x18000000: 0x4010,
            0x19000000: 0x80000,
            0x1a000000: 0x80010,
            0x1b000000: 0x40000010,
            0x1c000000: 0x84000,
            0x1d000000: 0x40004000,
            0x1e000000: 0x40000000,
            0x1f000000: 0x40084010,
            0x10800000: 0x84010,
            0x11800000: 0x80000,
            0x12800000: 0x40080000,
            0x13800000: 0x4000,
            0x14800000: 0x40004000,
            0x15800000: 0x40084010,
            0x16800000: 0x10,
            0x17800000: 0x40000000,
            0x18800000: 0x40084000,
            0x19800000: 0x40000010,
            0x1a800000: 0x40004010,
            0x1b800000: 0x80010,
            0x1c800000: 0x0,
            0x1d800000: 0x4010,
            0x1e800000: 0x40080010,
            0x1f800000: 0x84000,
          },
          {
            0x0: 0x104,
            0x100000: 0x0,
            0x200000: 0x4000100,
            0x300000: 0x10104,
            0x400000: 0x10004,
            0x500000: 0x4000004,
            0x600000: 0x4010104,
            0x700000: 0x4010000,
            0x800000: 0x4000000,
            0x900000: 0x4010100,
            0xa00000: 0x10100,
            0xb00000: 0x4010004,
            0xc00000: 0x4000104,
            0xd00000: 0x10000,
            0xe00000: 0x4,
            0xf00000: 0x100,
            0x80000: 0x4010100,
            0x180000: 0x4010004,
            0x280000: 0x0,
            0x380000: 0x4000100,
            0x480000: 0x4000004,
            0x580000: 0x10000,
            0x680000: 0x10004,
            0x780000: 0x104,
            0x880000: 0x4,
            0x980000: 0x100,
            0xa80000: 0x4010000,
            0xb80000: 0x10104,
            0xc80000: 0x10100,
            0xd80000: 0x4000104,
            0xe80000: 0x4010104,
            0xf80000: 0x4000000,
            0x1000000: 0x4010100,
            0x1100000: 0x10004,
            0x1200000: 0x10000,
            0x1300000: 0x4000100,
            0x1400000: 0x100,
            0x1500000: 0x4010104,
            0x1600000: 0x4000004,
            0x1700000: 0x0,
            0x1800000: 0x4000104,
            0x1900000: 0x4000000,
            0x1a00000: 0x4,
            0x1b00000: 0x10100,
            0x1c00000: 0x4010000,
            0x1d00000: 0x104,
            0x1e00000: 0x10104,
            0x1f00000: 0x4010004,
            0x1080000: 0x4000000,
            0x1180000: 0x104,
            0x1280000: 0x4010100,
            0x1380000: 0x0,
            0x1480000: 0x10004,
            0x1580000: 0x4000100,
            0x1680000: 0x100,
            0x1780000: 0x4010004,
            0x1880000: 0x10000,
            0x1980000: 0x4010104,
            0x1a80000: 0x10104,
            0x1b80000: 0x4000004,
            0x1c80000: 0x4000104,
            0x1d80000: 0x4010000,
            0x1e80000: 0x4,
            0x1f80000: 0x10100,
          },
          {
            0x0: 0x80401000,
            0x10000: 0x80001040,
            0x20000: 0x401040,
            0x30000: 0x80400000,
            0x40000: 0x0,
            0x50000: 0x401000,
            0x60000: 0x80000040,
            0x70000: 0x400040,
            0x80000: 0x80000000,
            0x90000: 0x400000,
            0xa0000: 0x40,
            0xb0000: 0x80001000,
            0xc0000: 0x80400040,
            0xd0000: 0x1040,
            0xe0000: 0x1000,
            0xf0000: 0x80401040,
            0x8000: 0x80001040,
            0x18000: 0x40,
            0x28000: 0x80400040,
            0x38000: 0x80001000,
            0x48000: 0x401000,
            0x58000: 0x80401040,
            0x68000: 0x0,
            0x78000: 0x80400000,
            0x88000: 0x1000,
            0x98000: 0x80401000,
            0xa8000: 0x400000,
            0xb8000: 0x1040,
            0xc8000: 0x80000000,
            0xd8000: 0x400040,
            0xe8000: 0x401040,
            0xf8000: 0x80000040,
            0x100000: 0x400040,
            0x110000: 0x401000,
            0x120000: 0x80000040,
            0x130000: 0x0,
            0x140000: 0x1040,
            0x150000: 0x80400040,
            0x160000: 0x80401000,
            0x170000: 0x80001040,
            0x180000: 0x80401040,
            0x190000: 0x80000000,
            0x1a0000: 0x80400000,
            0x1b0000: 0x401040,
            0x1c0000: 0x80001000,
            0x1d0000: 0x400000,
            0x1e0000: 0x40,
            0x1f0000: 0x1000,
            0x108000: 0x80400000,
            0x118000: 0x80401040,
            0x128000: 0x0,
            0x138000: 0x401000,
            0x148000: 0x400040,
            0x158000: 0x80000000,
            0x168000: 0x80001040,
            0x178000: 0x40,
            0x188000: 0x80000040,
            0x198000: 0x1000,
            0x1a8000: 0x80001000,
            0x1b8000: 0x80400040,
            0x1c8000: 0x1040,
            0x1d8000: 0x80401000,
            0x1e8000: 0x400000,
            0x1f8000: 0x401040,
          },
          {
            0x0: 0x80,
            0x1000: 0x1040000,
            0x2000: 0x40000,
            0x3000: 0x20000000,
            0x4000: 0x20040080,
            0x5000: 0x1000080,
            0x6000: 0x21000080,
            0x7000: 0x40080,
            0x8000: 0x1000000,
            0x9000: 0x20040000,
            0xa000: 0x20000080,
            0xb000: 0x21040080,
            0xc000: 0x21040000,
            0xd000: 0x0,
            0xe000: 0x1040080,
            0xf000: 0x21000000,
            0x800: 0x1040080,
            0x1800: 0x21000080,
            0x2800: 0x80,
            0x3800: 0x1040000,
            0x4800: 0x40000,
            0x5800: 0x20040080,
            0x6800: 0x21040000,
            0x7800: 0x20000000,
            0x8800: 0x20040000,
            0x9800: 0x0,
            0xa800: 0x21040080,
            0xb800: 0x1000080,
            0xc800: 0x20000080,
            0xd800: 0x21000000,
            0xe800: 0x1000000,
            0xf800: 0x40080,
            0x10000: 0x40000,
            0x11000: 0x80,
            0x12000: 0x20000000,
            0x13000: 0x21000080,
            0x14000: 0x1000080,
            0x15000: 0x21040000,
            0x16000: 0x20040080,
            0x17000: 0x1000000,
            0x18000: 0x21040080,
            0x19000: 0x21000000,
            0x1a000: 0x1040000,
            0x1b000: 0x20040000,
            0x1c000: 0x40080,
            0x1d000: 0x20000080,
            0x1e000: 0x0,
            0x1f000: 0x1040080,
            0x10800: 0x21000080,
            0x11800: 0x1000000,
            0x12800: 0x1040000,
            0x13800: 0x20040080,
            0x14800: 0x20000000,
            0x15800: 0x1040080,
            0x16800: 0x80,
            0x17800: 0x21040000,
            0x18800: 0x40080,
            0x19800: 0x21040080,
            0x1a800: 0x0,
            0x1b800: 0x21000000,
            0x1c800: 0x1000080,
            0x1d800: 0x40000,
            0x1e800: 0x20040000,
            0x1f800: 0x20000080,
          },
          {
            0x0: 0x10000008,
            0x100: 0x2000,
            0x200: 0x10200000,
            0x300: 0x10202008,
            0x400: 0x10002000,
            0x500: 0x200000,
            0x600: 0x200008,
            0x700: 0x10000000,
            0x800: 0x0,
            0x900: 0x10002008,
            0xa00: 0x202000,
            0xb00: 0x8,
            0xc00: 0x10200008,
            0xd00: 0x202008,
            0xe00: 0x2008,
            0xf00: 0x10202000,
            0x80: 0x10200000,
            0x180: 0x10202008,
            0x280: 0x8,
            0x380: 0x200000,
            0x480: 0x202008,
            0x580: 0x10000008,
            0x680: 0x10002000,
            0x780: 0x2008,
            0x880: 0x200008,
            0x980: 0x2000,
            0xa80: 0x10002008,
            0xb80: 0x10200008,
            0xc80: 0x0,
            0xd80: 0x10202000,
            0xe80: 0x202000,
            0xf80: 0x10000000,
            0x1000: 0x10002000,
            0x1100: 0x10200008,
            0x1200: 0x10202008,
            0x1300: 0x2008,
            0x1400: 0x200000,
            0x1500: 0x10000000,
            0x1600: 0x10000008,
            0x1700: 0x202000,
            0x1800: 0x202008,
            0x1900: 0x0,
            0x1a00: 0x8,
            0x1b00: 0x10200000,
            0x1c00: 0x2000,
            0x1d00: 0x10002008,
            0x1e00: 0x10202000,
            0x1f00: 0x200008,
            0x1080: 0x8,
            0x1180: 0x202000,
            0x1280: 0x200000,
            0x1380: 0x10000008,
            0x1480: 0x10002000,
            0x1580: 0x2008,
            0x1680: 0x10202008,
            0x1780: 0x10200000,
            0x1880: 0x10202000,
            0x1980: 0x10200008,
            0x1a80: 0x2000,
            0x1b80: 0x202008,
            0x1c80: 0x200008,
            0x1d80: 0x0,
            0x1e80: 0x10000000,
            0x1f80: 0x10002008,
          },
          {
            0x0: 0x100000,
            0x10: 0x2000401,
            0x20: 0x400,
            0x30: 0x100401,
            0x40: 0x2100401,
            0x50: 0x0,
            0x60: 0x1,
            0x70: 0x2100001,
            0x80: 0x2000400,
            0x90: 0x100001,
            0xa0: 0x2000001,
            0xb0: 0x2100400,
            0xc0: 0x2100000,
            0xd0: 0x401,
            0xe0: 0x100400,
            0xf0: 0x2000000,
            0x8: 0x2100001,
            0x18: 0x0,
            0x28: 0x2000401,
            0x38: 0x2100400,
            0x48: 0x100000,
            0x58: 0x2000001,
            0x68: 0x2000000,
            0x78: 0x401,
            0x88: 0x100401,
            0x98: 0x2000400,
            0xa8: 0x2100000,
            0xb8: 0x100001,
            0xc8: 0x400,
            0xd8: 0x2100401,
            0xe8: 0x1,
            0xf8: 0x100400,
            0x100: 0x2000000,
            0x110: 0x100000,
            0x120: 0x2000401,
            0x130: 0x2100001,
            0x140: 0x100001,
            0x150: 0x2000400,
            0x160: 0x2100400,
            0x170: 0x100401,
            0x180: 0x401,
            0x190: 0x2100401,
            0x1a0: 0x100400,
            0x1b0: 0x1,
            0x1c0: 0x0,
            0x1d0: 0x2100000,
            0x1e0: 0x2000001,
            0x1f0: 0x400,
            0x108: 0x100400,
            0x118: 0x2000401,
            0x128: 0x2100001,
            0x138: 0x1,
            0x148: 0x2000000,
            0x158: 0x100000,
            0x168: 0x401,
            0x178: 0x2100400,
            0x188: 0x2000001,
            0x198: 0x2100000,
            0x1a8: 0x0,
            0x1b8: 0x2100401,
            0x1c8: 0x100401,
            0x1d8: 0x400,
            0x1e8: 0x2000400,
            0x1f8: 0x100001,
          },
          {
            0x0: 0x8000820,
            0x1: 0x20000,
            0x2: 0x8000000,
            0x3: 0x20,
            0x4: 0x20020,
            0x5: 0x8020820,
            0x6: 0x8020800,
            0x7: 0x800,
            0x8: 0x8020000,
            0x9: 0x8000800,
            0xa: 0x20800,
            0xb: 0x8020020,
            0xc: 0x820,
            0xd: 0x0,
            0xe: 0x8000020,
            0xf: 0x20820,
            0x80000000: 0x800,
            0x80000001: 0x8020820,
            0x80000002: 0x8000820,
            0x80000003: 0x8000000,
            0x80000004: 0x8020000,
            0x80000005: 0x20800,
            0x80000006: 0x20820,
            0x80000007: 0x20,
            0x80000008: 0x8000020,
            0x80000009: 0x820,
            0x8000000a: 0x20020,
            0x8000000b: 0x8020800,
            0x8000000c: 0x0,
            0x8000000d: 0x8020020,
            0x8000000e: 0x8000800,
            0x8000000f: 0x20000,
            0x10: 0x20820,
            0x11: 0x8020800,
            0x12: 0x20,
            0x13: 0x800,
            0x14: 0x8000800,
            0x15: 0x8000020,
            0x16: 0x8020020,
            0x17: 0x20000,
            0x18: 0x0,
            0x19: 0x20020,
            0x1a: 0x8020000,
            0x1b: 0x8000820,
            0x1c: 0x8020820,
            0x1d: 0x20800,
            0x1e: 0x820,
            0x1f: 0x8000000,
            0x80000010: 0x20000,
            0x80000011: 0x800,
            0x80000012: 0x8020020,
            0x80000013: 0x20820,
            0x80000014: 0x20,
            0x80000015: 0x8020000,
            0x80000016: 0x8000000,
            0x80000017: 0x8000820,
            0x80000018: 0x8020820,
            0x80000019: 0x8000020,
            0x8000001a: 0x8000800,
            0x8000001b: 0x0,
            0x8000001c: 0x20800,
            0x8000001d: 0x820,
            0x8000001e: 0x20020,
            0x8000001f: 0x8020800,
          },
        ];

        // Masks that select the SBOX input
        var SBOX_MASK = [
          0xf8000001, 0x1f800000, 0x01f80000, 0x001f8000, 0x0001f800,
          0x00001f80, 0x000001f8, 0x8000001f,
        ];

        /**
         * DES block cipher algorithm.
         */
        var DES = (C_algo.DES = BlockCipher.extend({
          _doReset: function () {
            // Shortcuts
            var key = this._key;
            var keyWords = key.words;

            // Select 56 bits according to PC1
            var keyBits = [];
            for (var i = 0; i < 56; i++) {
              var keyBitPos = PC1[i] - 1;
              keyBits[i] =
                (keyWords[keyBitPos >>> 5] >>> (31 - (keyBitPos % 32))) & 1;
            }

            // Assemble 16 subkeys
            var subKeys = (this._subKeys = []);
            for (var nSubKey = 0; nSubKey < 16; nSubKey++) {
              // Create subkey
              var subKey = (subKeys[nSubKey] = []);

              // Shortcut
              var bitShift = BIT_SHIFTS[nSubKey];

              // Select 48 bits according to PC2
              for (var i = 0; i < 24; i++) {
                // Select from the left 28 key bits
                subKey[(i / 6) | 0] |=
                  keyBits[(PC2[i] - 1 + bitShift) % 28] << (31 - (i % 6));

                // Select from the right 28 key bits
                subKey[4 + ((i / 6) | 0)] |=
                  keyBits[28 + ((PC2[i + 24] - 1 + bitShift) % 28)] <<
                  (31 - (i % 6));
              }

              // Since each subkey is applied to an expanded 32-bit input,
              // the subkey can be broken into 8 values scaled to 32-bits,
              // which allows the key to be used without expansion
              subKey[0] = (subKey[0] << 1) | (subKey[0] >>> 31);
              for (var i = 1; i < 7; i++) {
                subKey[i] = subKey[i] >>> ((i - 1) * 4 + 3);
              }
              subKey[7] = (subKey[7] << 5) | (subKey[7] >>> 27);
            }

            // Compute inverse subkeys
            var invSubKeys = (this._invSubKeys = []);
            for (var i = 0; i < 16; i++) {
              invSubKeys[i] = subKeys[15 - i];
            }
          },

          encryptBlock: function (M, offset) {
            this._doCryptBlock(M, offset, this._subKeys);
          },

          decryptBlock: function (M, offset) {
            this._doCryptBlock(M, offset, this._invSubKeys);
          },

          _doCryptBlock: function (M, offset, subKeys) {
            // Get input
            this._lBlock = M[offset];
            this._rBlock = M[offset + 1];

            // Initial permutation
            exchangeLR.call(this, 4, 0x0f0f0f0f);
            exchangeLR.call(this, 16, 0x0000ffff);
            exchangeRL.call(this, 2, 0x33333333);
            exchangeRL.call(this, 8, 0x00ff00ff);
            exchangeLR.call(this, 1, 0x55555555);

            // Rounds
            for (var round = 0; round < 16; round++) {
              // Shortcuts
              var subKey = subKeys[round];
              var lBlock = this._lBlock;
              var rBlock = this._rBlock;

              // Feistel function
              var f = 0;
              for (var i = 0; i < 8; i++) {
                f |= SBOX_P[i][((rBlock ^ subKey[i]) & SBOX_MASK[i]) >>> 0];
              }
              this._lBlock = rBlock;
              this._rBlock = lBlock ^ f;
            }

            // Undo swap from last round
            var t = this._lBlock;
            this._lBlock = this._rBlock;
            this._rBlock = t;

            // Final permutation
            exchangeLR.call(this, 1, 0x55555555);
            exchangeRL.call(this, 8, 0x00ff00ff);
            exchangeRL.call(this, 2, 0x33333333);
            exchangeLR.call(this, 16, 0x0000ffff);
            exchangeLR.call(this, 4, 0x0f0f0f0f);

            // Set output
            M[offset] = this._lBlock;
            M[offset + 1] = this._rBlock;
          },

          keySize: 64 / 32,

          ivSize: 64 / 32,

          blockSize: 64 / 32,
        }));

        // Swap bits across the left and right words
        function exchangeLR(offset, mask) {
          var t = ((this._lBlock >>> offset) ^ this._rBlock) & mask;
          this._rBlock ^= t;
          this._lBlock ^= t << offset;
        }

        function exchangeRL(offset, mask) {
          var t = ((this._rBlock >>> offset) ^ this._lBlock) & mask;
          this._lBlock ^= t;
          this._rBlock ^= t << offset;
        }

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.DES.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.DES.decrypt(ciphertext, key, cfg);
         */
        C.DES = BlockCipher._createHelper(DES);

        /**
         * Triple-DES block cipher algorithm.
         */
        var TripleDES = (C_algo.TripleDES = BlockCipher.extend({
          _doReset: function () {
            // Shortcuts
            var key = this._key;
            var keyWords = key.words;
            // Make sure the key length is valid (64, 128 or >= 192 bit)
            if (
              keyWords.length !== 2 &&
              keyWords.length !== 4 &&
              keyWords.length < 6
            ) {
              throw new Error(
                'Invalid key length - 3DES requires the key length to be 64, 128, 192 or >192.'
              );
            }

            // Extend the key according to the keying options defined in 3DES standard
            var key1 = keyWords.slice(0, 2);
            var key2 =
              keyWords.length < 4 ? keyWords.slice(0, 2) : keyWords.slice(2, 4);
            var key3 =
              keyWords.length < 6 ? keyWords.slice(0, 2) : keyWords.slice(4, 6);

            // Create DES instances
            this._des1 = DES.createEncryptor(WordArray.create(key1));
            this._des2 = DES.createEncryptor(WordArray.create(key2));
            this._des3 = DES.createEncryptor(WordArray.create(key3));
          },

          encryptBlock: function (M, offset) {
            this._des1.encryptBlock(M, offset);
            this._des2.decryptBlock(M, offset);
            this._des3.encryptBlock(M, offset);
          },

          decryptBlock: function (M, offset) {
            this._des3.decryptBlock(M, offset);
            this._des2.encryptBlock(M, offset);
            this._des1.decryptBlock(M, offset);
          },

          keySize: 192 / 32,

          ivSize: 64 / 32,

          blockSize: 64 / 32,
        }));

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.TripleDES.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.TripleDES.decrypt(ciphertext, key, cfg);
         */
        C.TripleDES = BlockCipher._createHelper(TripleDES);
      })();

      return CryptoJS.TripleDES;
    });
  })(tripledes$1);
  return tripledes$1.exports;
}

var rc4$1 = { exports: {} };

var rc4 = rc4$1.exports;

var hasRequiredRc4;

function requireRc4() {
  if (hasRequiredRc4) return rc4$1.exports;
  hasRequiredRc4 = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(rc4, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var StreamCipher = C_lib.StreamCipher;
        var C_algo = C.algo;

        /**
         * RC4 stream cipher algorithm.
         */
        var RC4 = (C_algo.RC4 = StreamCipher.extend({
          _doReset: function () {
            // Shortcuts
            var key = this._key;
            var keyWords = key.words;
            var keySigBytes = key.sigBytes;

            // Init sbox
            var S = (this._S = []);
            for (var i = 0; i < 256; i++) {
              S[i] = i;
            }

            // Key setup
            for (var i = 0, j = 0; i < 256; i++) {
              var keyByteIndex = i % keySigBytes;
              var keyByte =
                (keyWords[keyByteIndex >>> 2] >>>
                  (24 - (keyByteIndex % 4) * 8)) &
                0xff;

              j = (j + S[i] + keyByte) % 256;

              // Swap
              var t = S[i];
              S[i] = S[j];
              S[j] = t;
            }

            // Counters
            this._i = this._j = 0;
          },

          _doProcessBlock: function (M, offset) {
            M[offset] ^= generateKeystreamWord.call(this);
          },

          keySize: 256 / 32,

          ivSize: 0,
        }));

        function generateKeystreamWord() {
          // Shortcuts
          var S = this._S;
          var i = this._i;
          var j = this._j;

          // Generate keystream word
          var keystreamWord = 0;
          for (var n = 0; n < 4; n++) {
            i = (i + 1) % 256;
            j = (j + S[i]) % 256;

            // Swap
            var t = S[i];
            S[i] = S[j];
            S[j] = t;

            keystreamWord |= S[(S[i] + S[j]) % 256] << (24 - n * 8);
          }

          // Update counters
          this._i = i;
          this._j = j;

          return keystreamWord;
        }

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.RC4.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.RC4.decrypt(ciphertext, key, cfg);
         */
        C.RC4 = StreamCipher._createHelper(RC4);

        /**
         * Modified RC4 stream cipher algorithm.
         */
        var RC4Drop = (C_algo.RC4Drop = RC4.extend({
          /**
           * Configuration options.
           *
           * @property {number} drop The number of keystream words to drop. Default 192
           */
          cfg: RC4.cfg.extend({
            drop: 192,
          }),

          _doReset: function () {
            RC4._doReset.call(this);

            // Drop
            for (var i = this.cfg.drop; i > 0; i--) {
              generateKeystreamWord.call(this);
            }
          },
        }));

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.RC4Drop.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.RC4Drop.decrypt(ciphertext, key, cfg);
         */
        C.RC4Drop = StreamCipher._createHelper(RC4Drop);
      })();

      return CryptoJS.RC4;
    });
  })(rc4$1);
  return rc4$1.exports;
}

var rabbit$1 = { exports: {} };

var rabbit = rabbit$1.exports;

var hasRequiredRabbit;

function requireRabbit() {
  if (hasRequiredRabbit) return rabbit$1.exports;
  hasRequiredRabbit = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(rabbit, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var StreamCipher = C_lib.StreamCipher;
        var C_algo = C.algo;

        // Reusable objects
        var S = [];
        var C_ = [];
        var G = [];

        /**
         * Rabbit stream cipher algorithm
         */
        var Rabbit = (C_algo.Rabbit = StreamCipher.extend({
          _doReset: function () {
            // Shortcuts
            var K = this._key.words;
            var iv = this.cfg.iv;

            // Swap endian
            for (var i = 0; i < 4; i++) {
              K[i] =
                (((K[i] << 8) | (K[i] >>> 24)) & 0x00ff00ff) |
                (((K[i] << 24) | (K[i] >>> 8)) & 0xff00ff00);
            }

            // Generate initial state values
            var X = (this._X = [
              K[0],
              (K[3] << 16) | (K[2] >>> 16),
              K[1],
              (K[0] << 16) | (K[3] >>> 16),
              K[2],
              (K[1] << 16) | (K[0] >>> 16),
              K[3],
              (K[2] << 16) | (K[1] >>> 16),
            ]);

            // Generate initial counter values
            var C = (this._C = [
              (K[2] << 16) | (K[2] >>> 16),
              (K[0] & 0xffff0000) | (K[1] & 0x0000ffff),
              (K[3] << 16) | (K[3] >>> 16),
              (K[1] & 0xffff0000) | (K[2] & 0x0000ffff),
              (K[0] << 16) | (K[0] >>> 16),
              (K[2] & 0xffff0000) | (K[3] & 0x0000ffff),
              (K[1] << 16) | (K[1] >>> 16),
              (K[3] & 0xffff0000) | (K[0] & 0x0000ffff),
            ]);

            // Carry bit
            this._b = 0;

            // Iterate the system four times
            for (var i = 0; i < 4; i++) {
              nextState.call(this);
            }

            // Modify the counters
            for (var i = 0; i < 8; i++) {
              C[i] ^= X[(i + 4) & 7];
            }

            // IV setup
            if (iv) {
              // Shortcuts
              var IV = iv.words;
              var IV_0 = IV[0];
              var IV_1 = IV[1];

              // Generate four subvectors
              var i0 =
                (((IV_0 << 8) | (IV_0 >>> 24)) & 0x00ff00ff) |
                (((IV_0 << 24) | (IV_0 >>> 8)) & 0xff00ff00);
              var i2 =
                (((IV_1 << 8) | (IV_1 >>> 24)) & 0x00ff00ff) |
                (((IV_1 << 24) | (IV_1 >>> 8)) & 0xff00ff00);
              var i1 = (i0 >>> 16) | (i2 & 0xffff0000);
              var i3 = (i2 << 16) | (i0 & 0x0000ffff);

              // Modify counter values
              C[0] ^= i0;
              C[1] ^= i1;
              C[2] ^= i2;
              C[3] ^= i3;
              C[4] ^= i0;
              C[5] ^= i1;
              C[6] ^= i2;
              C[7] ^= i3;

              // Iterate the system four times
              for (var i = 0; i < 4; i++) {
                nextState.call(this);
              }
            }
          },

          _doProcessBlock: function (M, offset) {
            // Shortcut
            var X = this._X;

            // Iterate the system
            nextState.call(this);

            // Generate four keystream words
            S[0] = X[0] ^ (X[5] >>> 16) ^ (X[3] << 16);
            S[1] = X[2] ^ (X[7] >>> 16) ^ (X[5] << 16);
            S[2] = X[4] ^ (X[1] >>> 16) ^ (X[7] << 16);
            S[3] = X[6] ^ (X[3] >>> 16) ^ (X[1] << 16);

            for (var i = 0; i < 4; i++) {
              // Swap endian
              S[i] =
                (((S[i] << 8) | (S[i] >>> 24)) & 0x00ff00ff) |
                (((S[i] << 24) | (S[i] >>> 8)) & 0xff00ff00);

              // Encrypt
              M[offset + i] ^= S[i];
            }
          },

          blockSize: 128 / 32,

          ivSize: 64 / 32,
        }));

        function nextState() {
          // Shortcuts
          var X = this._X;
          var C = this._C;

          // Save old counter values
          for (var i = 0; i < 8; i++) {
            C_[i] = C[i];
          }

          // Calculate new counter values
          C[0] = (C[0] + 0x4d34d34d + this._b) | 0;
          C[1] = (C[1] + 0xd34d34d3 + (C[0] >>> 0 < C_[0] >>> 0 ? 1 : 0)) | 0;
          C[2] = (C[2] + 0x34d34d34 + (C[1] >>> 0 < C_[1] >>> 0 ? 1 : 0)) | 0;
          C[3] = (C[3] + 0x4d34d34d + (C[2] >>> 0 < C_[2] >>> 0 ? 1 : 0)) | 0;
          C[4] = (C[4] + 0xd34d34d3 + (C[3] >>> 0 < C_[3] >>> 0 ? 1 : 0)) | 0;
          C[5] = (C[5] + 0x34d34d34 + (C[4] >>> 0 < C_[4] >>> 0 ? 1 : 0)) | 0;
          C[6] = (C[6] + 0x4d34d34d + (C[5] >>> 0 < C_[5] >>> 0 ? 1 : 0)) | 0;
          C[7] = (C[7] + 0xd34d34d3 + (C[6] >>> 0 < C_[6] >>> 0 ? 1 : 0)) | 0;
          this._b = C[7] >>> 0 < C_[7] >>> 0 ? 1 : 0;

          // Calculate the g-values
          for (var i = 0; i < 8; i++) {
            var gx = X[i] + C[i];

            // Construct high and low argument for squaring
            var ga = gx & 0xffff;
            var gb = gx >>> 16;

            // Calculate high and low result of squaring
            var gh = ((((ga * ga) >>> 17) + ga * gb) >>> 15) + gb * gb;
            var gl =
              (((gx & 0xffff0000) * gx) | 0) + (((gx & 0x0000ffff) * gx) | 0);

            // High XOR low
            G[i] = gh ^ gl;
          }

          // Calculate new state values
          X[0] =
            (G[0] +
              ((G[7] << 16) | (G[7] >>> 16)) +
              ((G[6] << 16) | (G[6] >>> 16))) |
            0;
          X[1] = (G[1] + ((G[0] << 8) | (G[0] >>> 24)) + G[7]) | 0;
          X[2] =
            (G[2] +
              ((G[1] << 16) | (G[1] >>> 16)) +
              ((G[0] << 16) | (G[0] >>> 16))) |
            0;
          X[3] = (G[3] + ((G[2] << 8) | (G[2] >>> 24)) + G[1]) | 0;
          X[4] =
            (G[4] +
              ((G[3] << 16) | (G[3] >>> 16)) +
              ((G[2] << 16) | (G[2] >>> 16))) |
            0;
          X[5] = (G[5] + ((G[4] << 8) | (G[4] >>> 24)) + G[3]) | 0;
          X[6] =
            (G[6] +
              ((G[5] << 16) | (G[5] >>> 16)) +
              ((G[4] << 16) | (G[4] >>> 16))) |
            0;
          X[7] = (G[7] + ((G[6] << 8) | (G[6] >>> 24)) + G[5]) | 0;
        }

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.Rabbit.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.Rabbit.decrypt(ciphertext, key, cfg);
         */
        C.Rabbit = StreamCipher._createHelper(Rabbit);
      })();

      return CryptoJS.Rabbit;
    });
  })(rabbit$1);
  return rabbit$1.exports;
}

var rabbitLegacy$1 = { exports: {} };

var rabbitLegacy = rabbitLegacy$1.exports;

var hasRequiredRabbitLegacy;

function requireRabbitLegacy() {
  if (hasRequiredRabbitLegacy) return rabbitLegacy$1.exports;
  hasRequiredRabbitLegacy = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(rabbitLegacy, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var StreamCipher = C_lib.StreamCipher;
        var C_algo = C.algo;

        // Reusable objects
        var S = [];
        var C_ = [];
        var G = [];

        /**
         * Rabbit stream cipher algorithm.
         *
         * This is a legacy version that neglected to convert the key to little-endian.
         * This error doesn't affect the cipher's security,
         * but it does affect its compatibility with other implementations.
         */
        var RabbitLegacy = (C_algo.RabbitLegacy = StreamCipher.extend({
          _doReset: function () {
            // Shortcuts
            var K = this._key.words;
            var iv = this.cfg.iv;

            // Generate initial state values
            var X = (this._X = [
              K[0],
              (K[3] << 16) | (K[2] >>> 16),
              K[1],
              (K[0] << 16) | (K[3] >>> 16),
              K[2],
              (K[1] << 16) | (K[0] >>> 16),
              K[3],
              (K[2] << 16) | (K[1] >>> 16),
            ]);

            // Generate initial counter values
            var C = (this._C = [
              (K[2] << 16) | (K[2] >>> 16),
              (K[0] & 0xffff0000) | (K[1] & 0x0000ffff),
              (K[3] << 16) | (K[3] >>> 16),
              (K[1] & 0xffff0000) | (K[2] & 0x0000ffff),
              (K[0] << 16) | (K[0] >>> 16),
              (K[2] & 0xffff0000) | (K[3] & 0x0000ffff),
              (K[1] << 16) | (K[1] >>> 16),
              (K[3] & 0xffff0000) | (K[0] & 0x0000ffff),
            ]);

            // Carry bit
            this._b = 0;

            // Iterate the system four times
            for (var i = 0; i < 4; i++) {
              nextState.call(this);
            }

            // Modify the counters
            for (var i = 0; i < 8; i++) {
              C[i] ^= X[(i + 4) & 7];
            }

            // IV setup
            if (iv) {
              // Shortcuts
              var IV = iv.words;
              var IV_0 = IV[0];
              var IV_1 = IV[1];

              // Generate four subvectors
              var i0 =
                (((IV_0 << 8) | (IV_0 >>> 24)) & 0x00ff00ff) |
                (((IV_0 << 24) | (IV_0 >>> 8)) & 0xff00ff00);
              var i2 =
                (((IV_1 << 8) | (IV_1 >>> 24)) & 0x00ff00ff) |
                (((IV_1 << 24) | (IV_1 >>> 8)) & 0xff00ff00);
              var i1 = (i0 >>> 16) | (i2 & 0xffff0000);
              var i3 = (i2 << 16) | (i0 & 0x0000ffff);

              // Modify counter values
              C[0] ^= i0;
              C[1] ^= i1;
              C[2] ^= i2;
              C[3] ^= i3;
              C[4] ^= i0;
              C[5] ^= i1;
              C[6] ^= i2;
              C[7] ^= i3;

              // Iterate the system four times
              for (var i = 0; i < 4; i++) {
                nextState.call(this);
              }
            }
          },

          _doProcessBlock: function (M, offset) {
            // Shortcut
            var X = this._X;

            // Iterate the system
            nextState.call(this);

            // Generate four keystream words
            S[0] = X[0] ^ (X[5] >>> 16) ^ (X[3] << 16);
            S[1] = X[2] ^ (X[7] >>> 16) ^ (X[5] << 16);
            S[2] = X[4] ^ (X[1] >>> 16) ^ (X[7] << 16);
            S[3] = X[6] ^ (X[3] >>> 16) ^ (X[1] << 16);

            for (var i = 0; i < 4; i++) {
              // Swap endian
              S[i] =
                (((S[i] << 8) | (S[i] >>> 24)) & 0x00ff00ff) |
                (((S[i] << 24) | (S[i] >>> 8)) & 0xff00ff00);

              // Encrypt
              M[offset + i] ^= S[i];
            }
          },

          blockSize: 128 / 32,

          ivSize: 64 / 32,
        }));

        function nextState() {
          // Shortcuts
          var X = this._X;
          var C = this._C;

          // Save old counter values
          for (var i = 0; i < 8; i++) {
            C_[i] = C[i];
          }

          // Calculate new counter values
          C[0] = (C[0] + 0x4d34d34d + this._b) | 0;
          C[1] = (C[1] + 0xd34d34d3 + (C[0] >>> 0 < C_[0] >>> 0 ? 1 : 0)) | 0;
          C[2] = (C[2] + 0x34d34d34 + (C[1] >>> 0 < C_[1] >>> 0 ? 1 : 0)) | 0;
          C[3] = (C[3] + 0x4d34d34d + (C[2] >>> 0 < C_[2] >>> 0 ? 1 : 0)) | 0;
          C[4] = (C[4] + 0xd34d34d3 + (C[3] >>> 0 < C_[3] >>> 0 ? 1 : 0)) | 0;
          C[5] = (C[5] + 0x34d34d34 + (C[4] >>> 0 < C_[4] >>> 0 ? 1 : 0)) | 0;
          C[6] = (C[6] + 0x4d34d34d + (C[5] >>> 0 < C_[5] >>> 0 ? 1 : 0)) | 0;
          C[7] = (C[7] + 0xd34d34d3 + (C[6] >>> 0 < C_[6] >>> 0 ? 1 : 0)) | 0;
          this._b = C[7] >>> 0 < C_[7] >>> 0 ? 1 : 0;

          // Calculate the g-values
          for (var i = 0; i < 8; i++) {
            var gx = X[i] + C[i];

            // Construct high and low argument for squaring
            var ga = gx & 0xffff;
            var gb = gx >>> 16;

            // Calculate high and low result of squaring
            var gh = ((((ga * ga) >>> 17) + ga * gb) >>> 15) + gb * gb;
            var gl =
              (((gx & 0xffff0000) * gx) | 0) + (((gx & 0x0000ffff) * gx) | 0);

            // High XOR low
            G[i] = gh ^ gl;
          }

          // Calculate new state values
          X[0] =
            (G[0] +
              ((G[7] << 16) | (G[7] >>> 16)) +
              ((G[6] << 16) | (G[6] >>> 16))) |
            0;
          X[1] = (G[1] + ((G[0] << 8) | (G[0] >>> 24)) + G[7]) | 0;
          X[2] =
            (G[2] +
              ((G[1] << 16) | (G[1] >>> 16)) +
              ((G[0] << 16) | (G[0] >>> 16))) |
            0;
          X[3] = (G[3] + ((G[2] << 8) | (G[2] >>> 24)) + G[1]) | 0;
          X[4] =
            (G[4] +
              ((G[3] << 16) | (G[3] >>> 16)) +
              ((G[2] << 16) | (G[2] >>> 16))) |
            0;
          X[5] = (G[5] + ((G[4] << 8) | (G[4] >>> 24)) + G[3]) | 0;
          X[6] =
            (G[6] +
              ((G[5] << 16) | (G[5] >>> 16)) +
              ((G[4] << 16) | (G[4] >>> 16))) |
            0;
          X[7] = (G[7] + ((G[6] << 8) | (G[6] >>> 24)) + G[5]) | 0;
        }

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.RabbitLegacy.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.RabbitLegacy.decrypt(ciphertext, key, cfg);
         */
        C.RabbitLegacy = StreamCipher._createHelper(RabbitLegacy);
      })();

      return CryptoJS.RabbitLegacy;
    });
  })(rabbitLegacy$1);
  return rabbitLegacy$1.exports;
}

var blowfish$1 = { exports: {} };

var blowfish = blowfish$1.exports;

var hasRequiredBlowfish;

function requireBlowfish() {
  if (hasRequiredBlowfish) return blowfish$1.exports;
  hasRequiredBlowfish = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireEncBase64(),
          requireMd5(),
          requireEvpkdf(),
          requireCipherCore()
        );
      }
    })(blowfish, function (CryptoJS) {
      (function () {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var BlockCipher = C_lib.BlockCipher;
        var C_algo = C.algo;

        const N = 16;

        //Origin pbox and sbox, derived from PI
        const ORIG_P = [
          0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822,
          0x299f31d0, 0x082efa98, 0xec4e6c89, 0x452821e6, 0x38d01377,
          0xbe5466cf, 0x34e90c6c, 0xc0ac29b7, 0xc97c50dd, 0x3f84d5b5,
          0xb5470917, 0x9216d5d9, 0x8979fb1b,
        ];

        const ORIG_S = [
          [
            0xd1310ba6, 0x98dfb5ac, 0x2ffd72db, 0xd01adfb7, 0xb8e1afed,
            0x6a267e96, 0xba7c9045, 0xf12c7f99, 0x24a19947, 0xb3916cf7,
            0x0801f2e2, 0x858efc16, 0x636920d8, 0x71574e69, 0xa458fea3,
            0xf4933d7e, 0x0d95748f, 0x728eb658, 0x718bcd58, 0x82154aee,
            0x7b54a41d, 0xc25a59b5, 0x9c30d539, 0x2af26013, 0xc5d1b023,
            0x286085f0, 0xca417918, 0xb8db38ef, 0x8e79dcb0, 0x603a180e,
            0x6c9e0e8b, 0xb01e8a3e, 0xd71577c1, 0xbd314b27, 0x78af2fda,
            0x55605c60, 0xe65525f3, 0xaa55ab94, 0x57489862, 0x63e81440,
            0x55ca396a, 0x2aab10b6, 0xb4cc5c34, 0x1141e8ce, 0xa15486af,
            0x7c72e993, 0xb3ee1411, 0x636fbc2a, 0x2ba9c55d, 0x741831f6,
            0xce5c3e16, 0x9b87931e, 0xafd6ba33, 0x6c24cf5c, 0x7a325381,
            0x28958677, 0x3b8f4898, 0x6b4bb9af, 0xc4bfe81b, 0x66282193,
            0x61d809cc, 0xfb21a991, 0x487cac60, 0x5dec8032, 0xef845d5d,
            0xe98575b1, 0xdc262302, 0xeb651b88, 0x23893e81, 0xd396acc5,
            0x0f6d6ff3, 0x83f44239, 0x2e0b4482, 0xa4842004, 0x69c8f04a,
            0x9e1f9b5e, 0x21c66842, 0xf6e96c9a, 0x670c9c61, 0xabd388f0,
            0x6a51a0d2, 0xd8542f68, 0x960fa728, 0xab5133a3, 0x6eef0b6c,
            0x137a3be4, 0xba3bf050, 0x7efb2a98, 0xa1f1651d, 0x39af0176,
            0x66ca593e, 0x82430e88, 0x8cee8619, 0x456f9fb4, 0x7d84a5c3,
            0x3b8b5ebe, 0xe06f75d8, 0x85c12073, 0x401a449f, 0x56c16aa6,
            0x4ed3aa62, 0x363f7706, 0x1bfedf72, 0x429b023d, 0x37d0d724,
            0xd00a1248, 0xdb0fead3, 0x49f1c09b, 0x075372c9, 0x80991b7b,
            0x25d479d8, 0xf6e8def7, 0xe3fe501a, 0xb6794c3b, 0x976ce0bd,
            0x04c006ba, 0xc1a94fb6, 0x409f60c4, 0x5e5c9ec2, 0x196a2463,
            0x68fb6faf, 0x3e6c53b5, 0x1339b2eb, 0x3b52ec6f, 0x6dfc511f,
            0x9b30952c, 0xcc814544, 0xaf5ebd09, 0xbee3d004, 0xde334afd,
            0x660f2807, 0x192e4bb3, 0xc0cba857, 0x45c8740f, 0xd20b5f39,
            0xb9d3fbdb, 0x5579c0bd, 0x1a60320a, 0xd6a100c6, 0x402c7279,
            0x679f25fe, 0xfb1fa3cc, 0x8ea5e9f8, 0xdb3222f8, 0x3c7516df,
            0xfd616b15, 0x2f501ec8, 0xad0552ab, 0x323db5fa, 0xfd238760,
            0x53317b48, 0x3e00df82, 0x9e5c57bb, 0xca6f8ca0, 0x1a87562e,
            0xdf1769db, 0xd542a8f6, 0x287effc3, 0xac6732c6, 0x8c4f5573,
            0x695b27b0, 0xbbca58c8, 0xe1ffa35d, 0xb8f011a0, 0x10fa3d98,
            0xfd2183b8, 0x4afcb56c, 0x2dd1d35b, 0x9a53e479, 0xb6f84565,
            0xd28e49bc, 0x4bfb9790, 0xe1ddf2da, 0xa4cb7e33, 0x62fb1341,
            0xcee4c6e8, 0xef20cada, 0x36774c01, 0xd07e9efe, 0x2bf11fb4,
            0x95dbda4d, 0xae909198, 0xeaad8e71, 0x6b93d5a0, 0xd08ed1d0,
            0xafc725e0, 0x8e3c5b2f, 0x8e7594b7, 0x8ff6e2fb, 0xf2122b64,
            0x8888b812, 0x900df01c, 0x4fad5ea0, 0x688fc31c, 0xd1cff191,
            0xb3a8c1ad, 0x2f2f2218, 0xbe0e1777, 0xea752dfe, 0x8b021fa1,
            0xe5a0cc0f, 0xb56f74e8, 0x18acf3d6, 0xce89e299, 0xb4a84fe0,
            0xfd13e0b7, 0x7cc43b81, 0xd2ada8d9, 0x165fa266, 0x80957705,
            0x93cc7314, 0x211a1477, 0xe6ad2065, 0x77b5fa86, 0xc75442f5,
            0xfb9d35cf, 0xebcdaf0c, 0x7b3e89a0, 0xd6411bd3, 0xae1e7e49,
            0x00250e2d, 0x2071b35e, 0x226800bb, 0x57b8e0af, 0x2464369b,
            0xf009b91e, 0x5563911d, 0x59dfa6aa, 0x78c14389, 0xd95a537f,
            0x207d5ba2, 0x02e5b9c5, 0x83260376, 0x6295cfa9, 0x11c81968,
            0x4e734a41, 0xb3472dca, 0x7b14a94a, 0x1b510052, 0x9a532915,
            0xd60f573f, 0xbc9bc6e4, 0x2b60a476, 0x81e67400, 0x08ba6fb5,
            0x571be91f, 0xf296ec6b, 0x2a0dd915, 0xb6636521, 0xe7b9f9b6,
            0xff34052e, 0xc5855664, 0x53b02d5d, 0xa99f8fa1, 0x08ba4799,
            0x6e85076a,
          ],
          [
            0x4b7a70e9, 0xb5b32944, 0xdb75092e, 0xc4192623, 0xad6ea6b0,
            0x49a7df7d, 0x9cee60b8, 0x8fedb266, 0xecaa8c71, 0x699a17ff,
            0x5664526c, 0xc2b19ee1, 0x193602a5, 0x75094c29, 0xa0591340,
            0xe4183a3e, 0x3f54989a, 0x5b429d65, 0x6b8fe4d6, 0x99f73fd6,
            0xa1d29c07, 0xefe830f5, 0x4d2d38e6, 0xf0255dc1, 0x4cdd2086,
            0x8470eb26, 0x6382e9c6, 0x021ecc5e, 0x09686b3f, 0x3ebaefc9,
            0x3c971814, 0x6b6a70a1, 0x687f3584, 0x52a0e286, 0xb79c5305,
            0xaa500737, 0x3e07841c, 0x7fdeae5c, 0x8e7d44ec, 0x5716f2b8,
            0xb03ada37, 0xf0500c0d, 0xf01c1f04, 0x0200b3ff, 0xae0cf51a,
            0x3cb574b2, 0x25837a58, 0xdc0921bd, 0xd19113f9, 0x7ca92ff6,
            0x94324773, 0x22f54701, 0x3ae5e581, 0x37c2dadc, 0xc8b57634,
            0x9af3dda7, 0xa9446146, 0x0fd0030e, 0xecc8c73e, 0xa4751e41,
            0xe238cd99, 0x3bea0e2f, 0x3280bba1, 0x183eb331, 0x4e548b38,
            0x4f6db908, 0x6f420d03, 0xf60a04bf, 0x2cb81290, 0x24977c79,
            0x5679b072, 0xbcaf89af, 0xde9a771f, 0xd9930810, 0xb38bae12,
            0xdccf3f2e, 0x5512721f, 0x2e6b7124, 0x501adde6, 0x9f84cd87,
            0x7a584718, 0x7408da17, 0xbc9f9abc, 0xe94b7d8c, 0xec7aec3a,
            0xdb851dfa, 0x63094366, 0xc464c3d2, 0xef1c1847, 0x3215d908,
            0xdd433b37, 0x24c2ba16, 0x12a14d43, 0x2a65c451, 0x50940002,
            0x133ae4dd, 0x71dff89e, 0x10314e55, 0x81ac77d6, 0x5f11199b,
            0x043556f1, 0xd7a3c76b, 0x3c11183b, 0x5924a509, 0xf28fe6ed,
            0x97f1fbfa, 0x9ebabf2c, 0x1e153c6e, 0x86e34570, 0xeae96fb1,
            0x860e5e0a, 0x5a3e2ab3, 0x771fe71c, 0x4e3d06fa, 0x2965dcb9,
            0x99e71d0f, 0x803e89d6, 0x5266c825, 0x2e4cc978, 0x9c10b36a,
            0xc6150eba, 0x94e2ea78, 0xa5fc3c53, 0x1e0a2df4, 0xf2f74ea7,
            0x361d2b3d, 0x1939260f, 0x19c27960, 0x5223a708, 0xf71312b6,
            0xebadfe6e, 0xeac31f66, 0xe3bc4595, 0xa67bc883, 0xb17f37d1,
            0x018cff28, 0xc332ddef, 0xbe6c5aa5, 0x65582185, 0x68ab9802,
            0xeecea50f, 0xdb2f953b, 0x2aef7dad, 0x5b6e2f84, 0x1521b628,
            0x29076170, 0xecdd4775, 0x619f1510, 0x13cca830, 0xeb61bd96,
            0x0334fe1e, 0xaa0363cf, 0xb5735c90, 0x4c70a239, 0xd59e9e0b,
            0xcbaade14, 0xeecc86bc, 0x60622ca7, 0x9cab5cab, 0xb2f3846e,
            0x648b1eaf, 0x19bdf0ca, 0xa02369b9, 0x655abb50, 0x40685a32,
            0x3c2ab4b3, 0x319ee9d5, 0xc021b8f7, 0x9b540b19, 0x875fa099,
            0x95f7997e, 0x623d7da8, 0xf837889a, 0x97e32d77, 0x11ed935f,
            0x16681281, 0x0e358829, 0xc7e61fd6, 0x96dedfa1, 0x7858ba99,
            0x57f584a5, 0x1b227263, 0x9b83c3ff, 0x1ac24696, 0xcdb30aeb,
            0x532e3054, 0x8fd948e4, 0x6dbc3128, 0x58ebf2ef, 0x34c6ffea,
            0xfe28ed61, 0xee7c3c73, 0x5d4a14d9, 0xe864b7e3, 0x42105d14,
            0x203e13e0, 0x45eee2b6, 0xa3aaabea, 0xdb6c4f15, 0xfacb4fd0,
            0xc742f442, 0xef6abbb5, 0x654f3b1d, 0x41cd2105, 0xd81e799e,
            0x86854dc7, 0xe44b476a, 0x3d816250, 0xcf62a1f2, 0x5b8d2646,
            0xfc8883a0, 0xc1c7b6a3, 0x7f1524c3, 0x69cb7492, 0x47848a0b,
            0x5692b285, 0x095bbf00, 0xad19489d, 0x1462b174, 0x23820e00,
            0x58428d2a, 0x0c55f5ea, 0x1dadf43e, 0x233f7061, 0x3372f092,
            0x8d937e41, 0xd65fecf1, 0x6c223bdb, 0x7cde3759, 0xcbee7460,
            0x4085f2a7, 0xce77326e, 0xa6078084, 0x19f8509e, 0xe8efd855,
            0x61d99735, 0xa969a7aa, 0xc50c06c2, 0x5a04abfc, 0x800bcadc,
            0x9e447a2e, 0xc3453484, 0xfdd56705, 0x0e1e9ec9, 0xdb73dbd3,
            0x105588cd, 0x675fda79, 0xe3674340, 0xc5c43465, 0x713e38d8,
            0x3d28f89e, 0xf16dff20, 0x153e21e7, 0x8fb03d4a, 0xe6e39f2b,
            0xdb83adf7,
          ],
          [
            0xe93d5a68, 0x948140f7, 0xf64c261c, 0x94692934, 0x411520f7,
            0x7602d4f7, 0xbcf46b2e, 0xd4a20068, 0xd4082471, 0x3320f46a,
            0x43b7d4b7, 0x500061af, 0x1e39f62e, 0x97244546, 0x14214f74,
            0xbf8b8840, 0x4d95fc1d, 0x96b591af, 0x70f4ddd3, 0x66a02f45,
            0xbfbc09ec, 0x03bd9785, 0x7fac6dd0, 0x31cb8504, 0x96eb27b3,
            0x55fd3941, 0xda2547e6, 0xabca0a9a, 0x28507825, 0x530429f4,
            0x0a2c86da, 0xe9b66dfb, 0x68dc1462, 0xd7486900, 0x680ec0a4,
            0x27a18dee, 0x4f3ffea2, 0xe887ad8c, 0xb58ce006, 0x7af4d6b6,
            0xaace1e7c, 0xd3375fec, 0xce78a399, 0x406b2a42, 0x20fe9e35,
            0xd9f385b9, 0xee39d7ab, 0x3b124e8b, 0x1dc9faf7, 0x4b6d1856,
            0x26a36631, 0xeae397b2, 0x3a6efa74, 0xdd5b4332, 0x6841e7f7,
            0xca7820fb, 0xfb0af54e, 0xd8feb397, 0x454056ac, 0xba489527,
            0x55533a3a, 0x20838d87, 0xfe6ba9b7, 0xd096954b, 0x55a867bc,
            0xa1159a58, 0xcca92963, 0x99e1db33, 0xa62a4a56, 0x3f3125f9,
            0x5ef47e1c, 0x9029317c, 0xfdf8e802, 0x04272f70, 0x80bb155c,
            0x05282ce3, 0x95c11548, 0xe4c66d22, 0x48c1133f, 0xc70f86dc,
            0x07f9c9ee, 0x41041f0f, 0x404779a4, 0x5d886e17, 0x325f51eb,
            0xd59bc0d1, 0xf2bcc18f, 0x41113564, 0x257b7834, 0x602a9c60,
            0xdff8e8a3, 0x1f636c1b, 0x0e12b4c2, 0x02e1329e, 0xaf664fd1,
            0xcad18115, 0x6b2395e0, 0x333e92e1, 0x3b240b62, 0xeebeb922,
            0x85b2a20e, 0xe6ba0d99, 0xde720c8c, 0x2da2f728, 0xd0127845,
            0x95b794fd, 0x647d0862, 0xe7ccf5f0, 0x5449a36f, 0x877d48fa,
            0xc39dfd27, 0xf33e8d1e, 0x0a476341, 0x992eff74, 0x3a6f6eab,
            0xf4f8fd37, 0xa812dc60, 0xa1ebddf8, 0x991be14c, 0xdb6e6b0d,
            0xc67b5510, 0x6d672c37, 0x2765d43b, 0xdcd0e804, 0xf1290dc7,
            0xcc00ffa3, 0xb5390f92, 0x690fed0b, 0x667b9ffb, 0xcedb7d9c,
            0xa091cf0b, 0xd9155ea3, 0xbb132f88, 0x515bad24, 0x7b9479bf,
            0x763bd6eb, 0x37392eb3, 0xcc115979, 0x8026e297, 0xf42e312d,
            0x6842ada7, 0xc66a2b3b, 0x12754ccc, 0x782ef11c, 0x6a124237,
            0xb79251e7, 0x06a1bbe6, 0x4bfb6350, 0x1a6b1018, 0x11caedfa,
            0x3d25bdd8, 0xe2e1c3c9, 0x44421659, 0x0a121386, 0xd90cec6e,
            0xd5abea2a, 0x64af674e, 0xda86a85f, 0xbebfe988, 0x64e4c3fe,
            0x9dbc8057, 0xf0f7c086, 0x60787bf8, 0x6003604d, 0xd1fd8346,
            0xf6381fb0, 0x7745ae04, 0xd736fccc, 0x83426b33, 0xf01eab71,
            0xb0804187, 0x3c005e5f, 0x77a057be, 0xbde8ae24, 0x55464299,
            0xbf582e61, 0x4e58f48f, 0xf2ddfda2, 0xf474ef38, 0x8789bdc2,
            0x5366f9c3, 0xc8b38e74, 0xb475f255, 0x46fcd9b9, 0x7aeb2661,
            0x8b1ddf84, 0x846a0e79, 0x915f95e2, 0x466e598e, 0x20b45770,
            0x8cd55591, 0xc902de4c, 0xb90bace1, 0xbb8205d0, 0x11a86248,
            0x7574a99e, 0xb77f19b6, 0xe0a9dc09, 0x662d09a1, 0xc4324633,
            0xe85a1f02, 0x09f0be8c, 0x4a99a025, 0x1d6efe10, 0x1ab93d1d,
            0x0ba5a4df, 0xa186f20f, 0x2868f169, 0xdcb7da83, 0x573906fe,
            0xa1e2ce9b, 0x4fcd7f52, 0x50115e01, 0xa70683fa, 0xa002b5c4,
            0x0de6d027, 0x9af88c27, 0x773f8641, 0xc3604c06, 0x61a806b5,
            0xf0177a28, 0xc0f586e0, 0x006058aa, 0x30dc7d62, 0x11e69ed7,
            0x2338ea63, 0x53c2dd94, 0xc2c21634, 0xbbcbee56, 0x90bcb6de,
            0xebfc7da1, 0xce591d76, 0x6f05e409, 0x4b7c0188, 0x39720a3d,
            0x7c927c24, 0x86e3725f, 0x724d9db9, 0x1ac15bb4, 0xd39eb8fc,
            0xed545578, 0x08fca5b5, 0xd83d7cd3, 0x4dad0fc4, 0x1e50ef5e,
            0xb161e6f8, 0xa28514d9, 0x6c51133c, 0x6fd5c7e7, 0x56e14ec4,
            0x362abfce, 0xddc6c837, 0xd79a3234, 0x92638212, 0x670efa8e,
            0x406000e0,
          ],
          [
            0x3a39ce37, 0xd3faf5cf, 0xabc27737, 0x5ac52d1b, 0x5cb0679e,
            0x4fa33742, 0xd3822740, 0x99bc9bbe, 0xd5118e9d, 0xbf0f7315,
            0xd62d1c7e, 0xc700c47b, 0xb78c1b6b, 0x21a19045, 0xb26eb1be,
            0x6a366eb4, 0x5748ab2f, 0xbc946e79, 0xc6a376d2, 0x6549c2c8,
            0x530ff8ee, 0x468dde7d, 0xd5730a1d, 0x4cd04dc6, 0x2939bbdb,
            0xa9ba4650, 0xac9526e8, 0xbe5ee304, 0xa1fad5f0, 0x6a2d519a,
            0x63ef8ce2, 0x9a86ee22, 0xc089c2b8, 0x43242ef6, 0xa51e03aa,
            0x9cf2d0a4, 0x83c061ba, 0x9be96a4d, 0x8fe51550, 0xba645bd6,
            0x2826a2f9, 0xa73a3ae1, 0x4ba99586, 0xef5562e9, 0xc72fefd3,
            0xf752f7da, 0x3f046f69, 0x77fa0a59, 0x80e4a915, 0x87b08601,
            0x9b09e6ad, 0x3b3ee593, 0xe990fd5a, 0x9e34d797, 0x2cf0b7d9,
            0x022b8b51, 0x96d5ac3a, 0x017da67d, 0xd1cf3ed6, 0x7c7d2d28,
            0x1f9f25cf, 0xadf2b89b, 0x5ad6b472, 0x5a88f54c, 0xe029ac71,
            0xe019a5e6, 0x47b0acfd, 0xed93fa9b, 0xe8d3c48d, 0x283b57cc,
            0xf8d56629, 0x79132e28, 0x785f0191, 0xed756055, 0xf7960e44,
            0xe3d35e8c, 0x15056dd4, 0x88f46dba, 0x03a16125, 0x0564f0bd,
            0xc3eb9e15, 0x3c9057a2, 0x97271aec, 0xa93a072a, 0x1b3f6d9b,
            0x1e6321f5, 0xf59c66fb, 0x26dcf319, 0x7533d928, 0xb155fdf5,
            0x03563482, 0x8aba3cbb, 0x28517711, 0xc20ad9f8, 0xabcc5167,
            0xccad925f, 0x4de81751, 0x3830dc8e, 0x379d5862, 0x9320f991,
            0xea7a90c2, 0xfb3e7bce, 0x5121ce64, 0x774fbe32, 0xa8b6e37e,
            0xc3293d46, 0x48de5369, 0x6413e680, 0xa2ae0810, 0xdd6db224,
            0x69852dfd, 0x09072166, 0xb39a460a, 0x6445c0dd, 0x586cdecf,
            0x1c20c8ae, 0x5bbef7dd, 0x1b588d40, 0xccd2017f, 0x6bb4e3bb,
            0xdda26a7e, 0x3a59ff45, 0x3e350a44, 0xbcb4cdd5, 0x72eacea8,
            0xfa6484bb, 0x8d6612ae, 0xbf3c6f47, 0xd29be463, 0x542f5d9e,
            0xaec2771b, 0xf64e6370, 0x740e0d8d, 0xe75b1357, 0xf8721671,
            0xaf537d5d, 0x4040cb08, 0x4eb4e2cc, 0x34d2466a, 0x0115af84,
            0xe1b00428, 0x95983a1d, 0x06b89fb4, 0xce6ea048, 0x6f3f3b82,
            0x3520ab82, 0x011a1d4b, 0x277227f8, 0x611560b1, 0xe7933fdc,
            0xbb3a792b, 0x344525bd, 0xa08839e1, 0x51ce794b, 0x2f32c9b7,
            0xa01fbac9, 0xe01cc87e, 0xbcc7d1f6, 0xcf0111c3, 0xa1e8aac7,
            0x1a908749, 0xd44fbd9a, 0xd0dadecb, 0xd50ada38, 0x0339c32a,
            0xc6913667, 0x8df9317c, 0xe0b12b4f, 0xf79e59b7, 0x43f5bb3a,
            0xf2d519ff, 0x27d9459c, 0xbf97222c, 0x15e6fc2a, 0x0f91fc71,
            0x9b941525, 0xfae59361, 0xceb69ceb, 0xc2a86459, 0x12baa8d1,
            0xb6c1075e, 0xe3056a0c, 0x10d25065, 0xcb03a442, 0xe0ec6e0e,
            0x1698db3b, 0x4c98a0be, 0x3278e964, 0x9f1f9532, 0xe0d392df,
            0xd3a0342b, 0x8971f21e, 0x1b0a7441, 0x4ba3348c, 0xc5be7120,
            0xc37632d8, 0xdf359f8d, 0x9b992f2e, 0xe60b6f47, 0x0fe3f11d,
            0xe54cda54, 0x1edad891, 0xce6279cf, 0xcd3e7e6f, 0x1618b166,
            0xfd2c1d05, 0x848fd2c5, 0xf6fb2299, 0xf523f357, 0xa6327623,
            0x93a83531, 0x56cccd02, 0xacf08162, 0x5a75ebb5, 0x6e163697,
            0x88d273cc, 0xde966292, 0x81b949d0, 0x4c50901b, 0x71c65614,
            0xe6c6c7bd, 0x327a140a, 0x45e1d006, 0xc3f27b9a, 0xc9aa53fd,
            0x62a80f00, 0xbb25bfe2, 0x35bdd2f6, 0x71126905, 0xb2040222,
            0xb6cbcf7c, 0xcd769c2b, 0x53113ec0, 0x1640e3d3, 0x38abbd60,
            0x2547adf0, 0xba38209c, 0xf746ce76, 0x77afa1c5, 0x20756060,
            0x85cbfe4e, 0x8ae88dd8, 0x7aaaf9b0, 0x4cf9aa7e, 0x1948c25c,
            0x02fb8a8c, 0x01c36ae4, 0xd6ebe1f9, 0x90d4f869, 0xa65cdea0,
            0x3f09252d, 0xc208e69f, 0xb74e6132, 0xce77e25b, 0x578fdfe3,
            0x3ac372e6,
          ],
        ];

        var BLOWFISH_CTX = {
          pbox: [],
          sbox: [],
        };

        function F(ctx, x) {
          let a = (x >> 24) & 0xff;
          let b = (x >> 16) & 0xff;
          let c = (x >> 8) & 0xff;
          let d = x & 0xff;

          let y = ctx.sbox[0][a] + ctx.sbox[1][b];
          y = y ^ ctx.sbox[2][c];
          y = y + ctx.sbox[3][d];

          return y;
        }

        function BlowFish_Encrypt(ctx, left, right) {
          let Xl = left;
          let Xr = right;
          let temp;

          for (let i = 0; i < N; ++i) {
            Xl = Xl ^ ctx.pbox[i];
            Xr = F(ctx, Xl) ^ Xr;

            temp = Xl;
            Xl = Xr;
            Xr = temp;
          }

          temp = Xl;
          Xl = Xr;
          Xr = temp;

          Xr = Xr ^ ctx.pbox[N];
          Xl = Xl ^ ctx.pbox[N + 1];

          return { left: Xl, right: Xr };
        }

        function BlowFish_Decrypt(ctx, left, right) {
          let Xl = left;
          let Xr = right;
          let temp;

          for (let i = N + 1; i > 1; --i) {
            Xl = Xl ^ ctx.pbox[i];
            Xr = F(ctx, Xl) ^ Xr;

            temp = Xl;
            Xl = Xr;
            Xr = temp;
          }

          temp = Xl;
          Xl = Xr;
          Xr = temp;

          Xr = Xr ^ ctx.pbox[1];
          Xl = Xl ^ ctx.pbox[0];

          return { left: Xl, right: Xr };
        }

        /**
         * Initialization ctx's pbox and sbox.
         *
         * @param {Object} ctx The object has pbox and sbox.
         * @param {Array} key An array of 32-bit words.
         * @param {int} keysize The length of the key.
         *
         * @example
         *
         *     BlowFishInit(BLOWFISH_CTX, key, 128/32);
         */
        function BlowFishInit(ctx, key, keysize) {
          for (let Row = 0; Row < 4; Row++) {
            ctx.sbox[Row] = [];
            for (let Col = 0; Col < 256; Col++) {
              ctx.sbox[Row][Col] = ORIG_S[Row][Col];
            }
          }

          let keyIndex = 0;
          for (let index = 0; index < N + 2; index++) {
            ctx.pbox[index] = ORIG_P[index] ^ key[keyIndex];
            keyIndex++;
            if (keyIndex >= keysize) {
              keyIndex = 0;
            }
          }

          let Data1 = 0;
          let Data2 = 0;
          let res = 0;
          for (let i = 0; i < N + 2; i += 2) {
            res = BlowFish_Encrypt(ctx, Data1, Data2);
            Data1 = res.left;
            Data2 = res.right;
            ctx.pbox[i] = Data1;
            ctx.pbox[i + 1] = Data2;
          }

          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 256; j += 2) {
              res = BlowFish_Encrypt(ctx, Data1, Data2);
              Data1 = res.left;
              Data2 = res.right;
              ctx.sbox[i][j] = Data1;
              ctx.sbox[i][j + 1] = Data2;
            }
          }

          return true;
        }

        /**
         * Blowfish block cipher algorithm.
         */
        var Blowfish = (C_algo.Blowfish = BlockCipher.extend({
          _doReset: function () {
            // Skip reset of nRounds has been set before and key did not change
            if (this._keyPriorReset === this._key) {
              return;
            }

            // Shortcuts
            var key = (this._keyPriorReset = this._key);
            var keyWords = key.words;
            var keySize = key.sigBytes / 4;

            //Initialization pbox and sbox
            BlowFishInit(BLOWFISH_CTX, keyWords, keySize);
          },

          encryptBlock: function (M, offset) {
            var res = BlowFish_Encrypt(BLOWFISH_CTX, M[offset], M[offset + 1]);
            M[offset] = res.left;
            M[offset + 1] = res.right;
          },

          decryptBlock: function (M, offset) {
            var res = BlowFish_Decrypt(BLOWFISH_CTX, M[offset], M[offset + 1]);
            M[offset] = res.left;
            M[offset + 1] = res.right;
          },

          blockSize: 64 / 32,

          keySize: 128 / 32,

          ivSize: 64 / 32,
        }));

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.Blowfish.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.Blowfish.decrypt(ciphertext, key, cfg);
         */
        C.Blowfish = BlockCipher._createHelper(Blowfish);
      })();

      return CryptoJS.Blowfish;
    });
  })(blowfish$1);
  return blowfish$1.exports;
}

var cryptoJs = cryptoJs$1.exports;

var hasRequiredCryptoJs;

function requireCryptoJs() {
  if (hasRequiredCryptoJs) return cryptoJs$1.exports;
  hasRequiredCryptoJs = 1;
  (function (module, exports) {
    (function (root, factory, undef) {
      {
        // CommonJS
        module.exports = factory(
          requireCore(),
          requireX64Core(),
          requireLibTypedarrays(),
          requireEncUtf16(),
          requireEncBase64(),
          requireEncBase64url(),
          requireMd5(),
          requireSha1(),
          requireSha256(),
          requireSha224(),
          requireSha512(),
          requireSha384(),
          requireSha3(),
          requireRipemd160(),
          requireHmac(),
          requirePbkdf2(),
          requireEvpkdf(),
          requireCipherCore(),
          requireModeCfb(),
          requireModeCtr(),
          requireModeCtrGladman(),
          requireModeOfb(),
          requireModeEcb(),
          requirePadAnsix923(),
          requirePadIso10126(),
          requirePadIso97971(),
          requirePadZeropadding(),
          requirePadNopadding(),
          requireFormatHex(),
          requireAes(),
          requireTripledes(),
          requireRc4(),
          requireRabbit(),
          requireRabbitLegacy(),
          requireBlowfish()
        );
      }
    })(cryptoJs, function (CryptoJS) {
      return CryptoJS;
    });
  })(cryptoJs$1);
  return cryptoJs$1.exports;
}

requireCryptoJs();

/**
 * @typedef {Object|string} KeyPair
 * @property {string} [epriv] - Private encryption key
 * @property {string} [epub] - Public encryption key
 * @property {string} [pub] - Optional public key
 * @property {string} [priv] - Optional private key
 */

/**
 * Encrypts data using SEA encryption
 * @param {string|Object} data - Data to encrypt
 * @param {KeyPair} keypair - Keypair for encryption
 * @returns {Promise<string>} Encrypted data
 * @throws {Error} If encryption fails
 */
async function encrypt(data, keypair) {
  try {
    const dataToEncrypt =
      typeof data === 'object' ? JSON.stringify(data) : data;
    const encrypted = await SEA$2.encrypt(dataToEncrypt, keypair);

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Encrypts data using a simple password
 * @param {string|Object} data - Data to encrypt
 * @param {string} password - Password for encryption
 * @returns {Promise<string>} Encrypted data
 */
async function encryptWithPassword(data, password) {
  try {
    const dataToEncrypt =
      typeof data === 'object' ? JSON.stringify(data) : data;

    const encrypted = await SEA$2.encrypt(dataToEncrypt, password);

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    return encrypted;
  } catch (error) {
    console.error('Password encryption error:', error);
    throw error;
  }
}

/**
 * Decrypts data using SEA decryption
 * @param {string} data - Encrypted data to decrypt
 * @param {KeyPair} keypair - Keypair for decryption
 * @returns {Promise<string|Object>} Decrypted data
 * @throws {Error} If decryption fails
 */
async function decrypt(data, keypair) {
  try {
    const decrypted = await SEA$2.decrypt(data, keypair);
    if (!decrypted) {
      console.log('Decryption returned null');
      throw new Error('Decryption failed');
    }

    try {
      return typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
    } catch (error) {
      console.log('Decryption returned non-string', error);
      return decrypted;
    }
  } catch (error) {
    console.error('Decryption error:', error);
    console.error('Data:', data);
    console.error('Keypair:', {
      hasEpriv: !!keypair?.epriv,
      hasEpub: !!keypair?.epub,
      hasPub: !!keypair?.pub,
      hasPriv: !!keypair?.priv,
    });
    throw error;
  }
}

/**
 * Decrypts data using a simple password
 * @param {string} encryptedData - Encrypted data to decrypt
 * @param {string} password - Password for decryption
 * @returns {Promise<string|Object>} Decrypted data
 */
async function decryptWithPassword(encryptedData, password) {
  try {
    if (!encryptedData || !password) {
      throw new Error('Missing required parameters');
    }

    console.log('Decrypting data:', {
      encryptedLength: encryptedData.length,
      passwordLength: password.length,
    });

    const decrypted = await SEA$2.decrypt(encryptedData, password);

    if (!decrypted) {
      throw new Error('Decryption failed');
    }

    return decrypted;
  } catch (error) {
    console.error('Password decryption error:', error);
    throw error;
  }
}

/**
 * Derives a shared secret key between two keypairs
 * @param {string} recipientEpub - Recipient's public encryption key
 * @param {KeyPair} senderKeypair - Sender's keypair
 * @returns {Promise<string>} Derived shared key
 * @throws {Error} If key derivation fails
 */
async function deriveSharedKey(recipientEpub, senderKeypair) {
  try {
    if (!recipientEpub || !senderKeypair || !senderKeypair.epriv) {
      throw new Error('Invalid parameters for shared key derivation');
    }

    const sharedKey = await SEA$2.secret(recipientEpub, senderKeypair);
    if (!sharedKey) {
      throw new Error('Failed to derive shared key');
    }

    return sharedKey;
  } catch (error) {
    console.error('Error deriving shared key:', error);
    throw error;
  }
}

// @ts-nocheck

const MESSAGE_TO_SIGN = 'Access GunDB with Ethereum';

/**
 * Genera una password da una firma
 * @param {string} signature - La firma da usare
 * @returns {Promise<string>} La password generata
 */
async function generatePassword(signature) {
  if (!signature) {
    throw new Error('Firma non valida');
  }
  const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
  return hash.slice(2, 66); // Rimuovi 0x e usa i primi 32 bytes
}

/**
 * Verifica una firma
 * @param {string} message - Il messaggio originale
 * @param {string} signature - La firma da verificare
 * @returns {Promise<string>} L'indirizzo recuperato
 */
async function verifySignature(message, signature) {
  if (!message || !signature) {
    throw new Error('Messaggio o firma non validi');
  }
  return ethers.verifyMessage(message, signature);
}

/**
 * @typedef {import('ethers').Eip1193Provider} EthereumProvider
 */

/** @typedef {Window & { ethereum?: EthereumProvider }} WindowWithEthereum */

const window$1 = globalThis.window;

// Singleton for signer management
class SignerManager {
  static instance = null;
  static provider = null;
  static signer = null;
  static rpcUrl = '';
  static privateKey = '';

  static getInstance() {
    if (!SignerManager.instance) {
      SignerManager.instance = new SignerManager();
    }
    return SignerManager.instance;
  }

  static async getSigner() {
    if (SignerManager.signer) {
      return SignerManager.signer;
    }

    if (SignerManager.rpcUrl !== '' && SignerManager.privateKey !== '') {
      SignerManager.provider = new ethers.JsonRpcProvider(SignerManager.rpcUrl);
      const wallet = new ethers.Wallet(
        SignerManager.privateKey,
        SignerManager.provider
      );
      // Create a proxy instead of modifying the wallet directly
      SignerManager.signer = new Proxy(wallet, {
        get(target, prop) {
          if (prop === 'address') {
            return target.address;
          }
          if (prop === 'privateKey') {
            return SignerManager.privateKey;
          }
          return target[prop];
        },
      });
      return SignerManager.signer;
    }

    if (typeof window$1 !== 'undefined' && window$1?.ethereum) {
      /** @type {WindowWithEthereum} */
      const windowWithEthereum = window$1;
      await windowWithEthereum.ethereum?.request({
        method: 'eth_requestAccounts',
      });
      const browserProvider = new ethers.BrowserProvider(
        windowWithEthereum.ethereum
      );
      const signer = await browserProvider.getSigner();
      // Create a proxy for the browser signer as well
      SignerManager.signer = new Proxy(signer, {
        get(target, prop) {
          if (prop === 'address') {
            return target.getAddress();
          }
          if (prop === 'privateKey') {
            return '';
          }
          return target[prop];
        },
      });
      return SignerManager.signer;
    }

    throw new Error('No valid Ethereum provider found. Call setSigner first.');
  }

  static setSigner(newRpcUrl, newPrivateKey) {
    SignerManager.rpcUrl = newRpcUrl;
    SignerManager.privateKey = newPrivateKey;
    SignerManager.provider = new ethers.JsonRpcProvider(newRpcUrl);
    const wallet = new ethers.Wallet(newPrivateKey, SignerManager.provider);
    // Create a proxy for the new signer
    SignerManager.signer = new Proxy(wallet, {
      get(target, prop) {
        if (prop === 'address') {
          return target.address;
        }
        if (prop === 'privateKey') {
          return SignerManager.privateKey;
        }
        return target[prop];
      },
    });
    console.log('Signer configured with address:', wallet.address);
    return SignerManager.instance;
  }
}

function generateRandomId() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function setSigner$1(newRpcUrl, newPrivateKey) {
  return SignerManager.setSigner(newRpcUrl, newPrivateKey);
}

async function getSigner$1() {
  return SignerManager.getSigner();
}

// @ts-check

class StealthChain {
  /**
   * Genera un indirizzo stealth per il destinatario
   * @param {string} receiverViewingKey - Chiave pubblica di visualizzazione del destinatario
   * @param {string} receiverSpendingKey - Chiave pubblica di spesa del destinatario
   * @returns {Promise<Object>} Indirizzo stealth generato e chiavi associate
   */
  async generateStealthAddress(receiverViewingKey, receiverSpendingKey) {
    try {
      // Genera una nuova coppia di chiavi effimere del mittente
      const senderEphemeralPair = await SEA.pair();

      if (!senderEphemeralPair || !senderEphemeralPair.epub) {
        throw new Error("Failed to generate sender's ephemeral keypair");
      }

      // Deriva il segreto condiviso usando la viewing key del destinatario
      const sharedSecret = await deriveSharedKey(
        receiverViewingKey,
        senderEphemeralPair
      );

      if (!sharedSecret) {
        throw new Error('Failed to derive shared secret');
      }

      // Deriva l'indirizzo stealth usando le chiavi del destinatario
      const { stealthAddress, stealthPrivateKey } = this.deriveStealthAddress(
        sharedSecret,
        receiverSpendingKey,
        senderEphemeralPair.epub,
        receiverViewingKey
      );

      return {
        stealthAddress,
        senderEphemeralPublicKey: senderEphemeralPair.epub,
        sharedSecret,
        stealthPrivateKey,
      };
    } catch (error) {
      console.error('Error in generateStealthAddress:', error);
      throw error;
    }
  }

  /**
   * Deriva un indirizzo stealth dai parametri forniti
   * @param {string} sharedSecret - Segreto condiviso tra mittente e destinatario
   * @param {string} receiverSpendingKey - Chiave pubblica di spesa del destinatario
   * @param {string} senderEphemeralKey - Chiave pubblica effimera del mittente
   * @param {string} receiverViewingKey - Chiave pubblica di visualizzazione del destinatario
   * @returns {Object} Indirizzo stealth e chiavi derivate
   */
  deriveStealthAddress(
    sharedSecret,
    receiverSpendingKey,
    senderEphemeralKey,
    receiverViewingKey
  ) {
    try {
      // Funzione migliorata per convertire base64 in hex
      const base64ToHex = (base64) => {
        try {
          // Rimuovi il punto e prendi la prima parte
          const parts = base64.split('.');
          const cleanBase64 = parts[0];

          // Sostituisci i caratteri speciali di base64url con base64 standard
          const standardBase64 = cleanBase64
            .replace(/-/g, '+')
            .replace(/_/g, '/');

          // Aggiungi il padding se necessario
          const padding = '='.repeat((4 - (standardBase64.length % 4)) % 4);
          const paddedBase64 = standardBase64 + padding;

          // Decodifica base64 in binario
          const raw = atob(paddedBase64);

          // Converti binario in hex
          let hex = '';
          for (let i = 0; i < raw.length; i++) {
            const hexByte = raw.charCodeAt(i).toString(16).padStart(2, '0');
            hex += hexByte;
          }

          return '0x' + hex;
        } catch (error) {
          console.error('Errore nella conversione base64 a hex:', error);
          throw new Error(
            `Impossibile convertire la chiave da base64 a hex: ${error.message}`
          );
        }
      };

      // Converti tutti i valori in hex
      const sharedSecretHex = base64ToHex(sharedSecret);
      const receiverSpendingKeyHex = base64ToHex(receiverSpendingKey);
      const senderEphemeralKeyHex = base64ToHex(senderEphemeralKey);
      const receiverViewingKeyHex = base64ToHex(receiverViewingKey);

      // Genera la chiave privata stealth combinando tutti i parametri
      const stealthPrivateKey = ethers.keccak256(
        ethers.concat([
          ethers.getBytes(sharedSecretHex),
          ethers.getBytes(receiverSpendingKeyHex),
          ethers.getBytes(senderEphemeralKeyHex),
          ethers.getBytes(receiverViewingKeyHex),
        ])
      );

      // Crea il wallet stealth
      const stealthWallet = new ethers.Wallet(stealthPrivateKey);

      return {
        stealthPrivateKey,
        stealthAddress: stealthWallet.address,
        wallet: stealthWallet,
      };
    } catch (error) {
      console.error('Error in deriveStealthAddress:', error);
      throw error;
    }
  }

  /**
   * Crea un annuncio di pagamento stealth
   * @param {string} stealthAddress - Indirizzo stealth generato
   * @param {string} senderEphemeralKey - Chiave pubblica effimera del mittente
   * @param {string} receiverViewingKey - Chiave pubblica di visualizzazione del destinatario
   * @param {string} receiverSpendingKey - Chiave pubblica di spesa del destinatario
   */
  createStealthAnnouncement(
    stealthAddress,
    senderEphemeralKey,
    receiverViewingKey,
    receiverSpendingKey
  ) {
    return {
      stealthAddress,
      senderEphemeralKey,
      receiverViewingKey,
      receiverSpendingKey,
      timestamp: Date.now(),
    };
  }

  /**
   * Recupera i fondi stealth
   * @param {string} stealthAddress - Indirizzo stealth
   * @param {string} senderPublicKey - Chiave pubblica del mittente
   * @param {string} signature - Firma per l'autenticazione
   * @param {string} spendingPublicKey - Chiave pubblica di spesa
   * @returns {Object} Dettagli del recupero
   */
  createRecoveryData(
    stealthAddress,
    senderPublicKey,
    signature,
    spendingPublicKey
  ) {
    return {
      stealthAddress,
      senderPublicKey,
      spendingPublicKey,
      signature,
      timestamp: Date.now(),
    };
  }
}

const SEA$1 = Gun$1.SEA;
let gun = null;

/**
 * @param {string} newRpcUrl
 * @param {string} newPrivateKey
 */
function setSigner(newRpcUrl, newPrivateKey) {
  return setSigner$1(newRpcUrl, newPrivateKey);
}

async function getSigner() {
  return getSigner$1();
}

/**
 * Converte una chiave privata Gun in formato Ethereum
 * @param {string} gunPrivateKey - Chiave privata in formato Gun
 * @returns {Promise<string>} Chiave privata in formato Ethereum
 */
async function convertToEthAddress(gunPrivateKey) {
  const base64UrlToHex = (base64url) => {
    try {
      const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
      const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
      const binary = atob(base64);
      const hex = Array.from(binary, (char) =>
        char.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('');

      if (hex.length !== 64) {
        throw new Error('Lunghezza chiave privata non valida');
      }
      return hex;
    } catch (error) {
      console.error('Errore nella conversione base64Url to hex:', error);
      throw new Error('Impossibile convertire la chiave privata');
    }
  };

  const hexPrivateKey = '0x' + base64UrlToHex(gunPrivateKey);
  return hexPrivateKey;
}

/**
 * Converte un account Gun in un account Ethereum
 * @param {Object} gunKeyPair - Coppia di chiavi Gun
 * @returns {Promise<Object>} Account convertito
 */
async function gunToEthAccount(gunKeyPair, password) {
  try {
    const hexPrivateKey = await convertToEthAddress(gunKeyPair.epriv);

    if (!ethers.isHexString(hexPrivateKey, 32)) {
      throw new Error('Chiave privata non valida dopo la conversione');
    }

    const internalWallet = new ethers.Wallet(hexPrivateKey);

    const [v_pair, s_pair] = await Promise.all([SEA$1.pair(), SEA$1.pair()]);

    if (!v_pair || !s_pair) {
      throw new Error('Impossibile generare le coppie di chiavi stealth');
    }

    // hash the password

    const [encryptedPair, encryptedV_pair, encryptedS_pair] = await Promise.all(
      [
        encryptWithPassword(gunKeyPair, password),
        encryptWithPassword(v_pair, password),
        encryptWithPassword(s_pair, password),
      ]
    );

    return {
      pub: gunKeyPair.pub,
      internalWalletAddress: internalWallet.address,
      internalWalletPk: hexPrivateKey,
      pair: gunKeyPair,
      v_pair,
      s_pair,
      viewingPublicKey: v_pair.epub,
      spendingPublicKey: s_pair.epub,
      env_pair: encryptedPair,
      env_v_pair: encryptedV_pair,
      env_s_pair: encryptedS_pair,
    };
  } catch (error) {
    console.error('Errore in gunToEthAccount:', error);
    throw error;
  }
}

/**
 * Crea un account Gun da un account Ethereum
 * @param {boolean} [isSecondary] - Flag per indicare se è un account secondario
 * @returns {Promise<Object>} Account creato
 */

async function ethToGunAccount(isSecondary = false) {
  try {
    // Se è un account secondario, creiamo solo il wallet base
    if (isSecondary) {
      const randomBytes = ethers.randomBytes(32);
      if (!randomBytes || randomBytes.length !== 32) {
        throw new Error('Generazione bytes casuali fallita');
      }
      const wallet = new ethers.Wallet(ethers.hexlify(randomBytes));
      return {
        publicKey: wallet.address,
        address: wallet.address,
      };
    }

    // Otteniamo il signer e la firma
    const signer = await getSigner();
    const signature = await signer.signMessage(MESSAGE_TO_SIGN);
    const password = await generatePassword(signature);

    // Generiamo le coppie di chiavi per stealth paymentseth
    const [pair, v_pair, s_pair] = await Promise.all([
      SEA$1.pair(),
      SEA$1.pair(),
      SEA$1.pair(),
    ]);

    if (!pair || !v_pair || !s_pair) {
      throw new Error('Impossibile generare le coppie di chiavi stealth');
    }

    const [encryptedPair, encryptedV_pair, encryptedS_pair] = await Promise.all(
      [
        encryptWithPassword(pair, password),
        encryptWithPassword(v_pair, password),
        encryptWithPassword(s_pair, password),
      ]
    );

    const hexPrivateKey = await convertToEthAddress(pair.epriv);

    if (!ethers.isHexString(hexPrivateKey, 32)) {
      throw new Error('Chiave privata non valida dopo la conversione');
    }

    const internalWallet = new ethers.Wallet(hexPrivateKey);

    return {
      pub: pair.pub,
      internalWalletAddress: internalWallet.address,
      internalWalletPk: hexPrivateKey,
      pair: pair,
      v_pair,
      s_pair,
      viewingPublicKey: v_pair.epub,
      spendingPublicKey: s_pair.epub,
      env_pair: encryptedPair,
      env_v_pair: encryptedV_pair,
      env_s_pair: encryptedS_pair,
    };
  } catch (error) {
    console.error('Errore in ethToGunAccount:', error);
    throw error;
  }
}

// =============================================
// STEALTH METHODS
// =============================================

/**
 * Estende Gun con i metodi stealth
 * @param {import("gun").IGun} Gun
 */
function extendGunWithStealth(Gun) {
  const stealthMethods = {
    async generateStealthAddress(receiverViewingKey, receiverSpendingKey) {
      const stealth = new StealthChain();
      return stealth.generateStealthAddress(
        receiverViewingKey,
        receiverSpendingKey
      );
    },

    async deriveStealthAddress(
      sharedSecret,
      receiverSpendingKey,
      senderEphemeralKey,
      receiverViewingKey
    ) {
      const stealth = new StealthChain();
      return stealth.deriveStealthAddress(
        sharedSecret,
        receiverSpendingKey,
        senderEphemeralKey,
        receiverViewingKey
      );
    },

    async announceStealthPayment(
      stealthAddress,
      senderEphemeralKey,
      receiverViewingKey,
      receiverSpendingKey
    ) {
      const stealth = new StealthChain();
      return stealth.createStealthAnnouncement(
        stealthAddress,
        senderEphemeralKey,
        receiverViewingKey,
        receiverSpendingKey
      );
    },

    async recoverStealthFunds(
      stealthAddress,
      senderPublicKey,
      signature,
      spendingPublicKey
    ) {
      const stealth = new StealthChain();
      return stealth.createRecoveryData(
        stealthAddress,
        senderPublicKey,
        signature,
        spendingPublicKey
      );
    },
  };

  Object.assign(Gun.chain, stealthMethods);
}

// =============================================
// GUN EXTENSIONS
// =============================================

/**
 * @param {import("gun").IGun} Gun
 */
function extendGun(Gun) {
  const baseMethods = {
    MESSAGE_TO_SIGN,
    setSigner,
    getSigner,
    verifySignature,
    generatePassword,
    gunToEthAccount,
    encryptWithPassword,
    decryptWithPassword,
    encrypt,
    decrypt,
    createSignature,
    convertToEthAddress,
  };

  Object.assign(Gun.chain, baseMethods);
  extendGunWithStealth(Gun);
}

/**
 * Inizializza Gun con le estensioni e le opzioni specificate
 * @param {Object} options - Opzioni di configurazione per Gun
 * @returns {import("gun").IGunInstance}
 */
function initializeGun(options = {}) {
  if (!Gun$1.SEA) {
    console.warn('Gun.SEA non disponibile, ricarico le estensioni...');
  }

  extendGun(Gun$1);
  gun = new Gun$1(options);

  if (!gun || typeof gun.user !== 'function') {
    throw new Error('Inizializzazione Gun fallita: user API non disponibile');
  }

  return gun;
}

/**
 * Crea una firma utilizzando il signer configurato
 * @param {string} message - Messaggio da firmare
 * @returns {Promise<string>} Firma generata
 */
async function createSignature(message) {
  try {
    if (!message) {
      throw new Error('Messaggio da firmare non valido');
    }

    const signer = await getSigner();
    const signature = await signer.signMessage(message);

    if (!signature || typeof signature !== 'string') {
      throw new Error('Firma non valida');
    }

    return signature;
  } catch (error) {
    console.error('Errore nella creazione della firma:', error);
    throw error;
  }
}

/**
 * @typedef {Object} BrowserGunEth
 * @property {Object} GunEth
 * @property {function} GunEth.init
 * @property {function} GunEth.generatePassword
 * @property {function} GunEth.getSigner
 * @property {function} GunEth.verifySignature
 * @property {function} GunEth.initializeGun
 * @property {function} GunEth.setSigner
 * @property {function} GunEth.gunToEthAccount
 * @property {function} GunEth.decryptWithPassword
 * @property {function} GunEth.encryptWithPassword
 * @property {function} GunEth.encrypt
 * @property {function} GunEth.decrypt
 * @property {function} GunEth.ethToGunAccount
 * @property {function} GunEth.createSignature
 * @property {function} GunEth.generateRandomId
 * @property {function} GunEth.extendGun
 * @property {string} GunEth.MESSAGE_TO_SIGN
 */

/** @type {BrowserGunEth} */
const browserGunEth = {
  GunEth: {
    MESSAGE_TO_SIGN,
    generateRandomId,
    getSigner,
    generatePassword,
    verifySignature,
    initializeGun,
    extendGun,
    createSignature,
    setSigner,
    gunToEthAccount,
    decryptWithPassword,
    encryptWithPassword,
    encrypt,
    decrypt,
    ethToGunAccount,
    async init() {
      return this;
    },
  },
};

export { browserGunEth as default };
