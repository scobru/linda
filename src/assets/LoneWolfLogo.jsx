let LoneWolfLogo = () => {
    return (
        <div class="flex flex-col justify-center items-center w-full h-auto">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 200 200" class="w-48 h-48">
                <g fill="none" stroke="black">
                    {/* Testa del lupo in stile giapponese */}
                    <path d="M100,30
                            L60,90
                            L100,130 
                            L140,90
                            Z"
                          stroke-width="2"
                          stroke-linejoin="round" />
                    
                    {/* Occhi allungati in stile giapponese */}
                    <path d="M80,70 L90,70" stroke-width="2" stroke-linecap="round" />
                    <path d="M110,70 L120,70" stroke-width="2" stroke-linecap="round" />
                    
                    {/* Muso più affilato */}
                    <path d="M95,85
                            L100,100
                            L105,85"
                          stroke-width="1.5"
                          fill="none"
                          stroke-linecap="round" />
                    
                    {/* Decorazioni giapponesi */}
                    <path d="M70,60
                            Q80,50 90,60"
                          stroke-width="1.5"
                          fill="none" />
                    <path d="M110,60
                            Q120,50 130,60"
                          stroke-width="1.5"
                          fill="none" />
                    
                    {/* Corpo stilizzato con linee curve */}
                    <path d="M100,130
                            Q85,145 75,170
                            M100,130
                            Q115,145 125,170"
                          stroke-width="2"
                          stroke-linecap="round" />
                </g>
            </svg>
        </div>
    );
};

export default LoneWolfLogo;
