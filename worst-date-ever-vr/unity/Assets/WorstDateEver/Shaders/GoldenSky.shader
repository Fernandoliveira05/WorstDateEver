Shader "WorstDateEver/GoldenSky"
{
    Properties { _TimeOfDay ("Time of day", Float) = 0 }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Opaque" }
        Cull Front
        ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            struct In { float4 vertex : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Out { float4 position : SV_POSITION; float3 world : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };
            Out vert(In v)
            {
                Out o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Out,o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.position = UnityObjectToClipPos(v.vertex);
                o.world = mul(unity_ObjectToWorld,v.vertex).xyz;
                return o;
            }
            float _TimeOfDay;
            fixed4 frag(Out i) : SV_Target
            {
                float3 direction = normalize(i.world-_WorldSpaceCameraPos);
                float2 skyPosition = float2(atan2(direction.x,direction.z)*19.0,
                    asin(clamp(direction.y,-1,1))*19.0+1.45);
                float height = smoothstep(1.4,8.8,skyPosition.y);
                fixed3 sky = lerp(fixed3(.96,.65,.47),fixed3(.39,.58,.73),height);
                if (_TimeOfDay > 1.5)
                {
                    fixed3 night = lerp(fixed3(.19,.25,.39),fixed3(.06,.09,.20),height);
                    float2 starGrid = skyPosition * 3.9;
                    float2 cell = floor(starGrid);
                    float noise = frac(sin(dot(cell,float2(12.9898,78.233))) * 43758.5453);
                    float star = (1-smoothstep(.025,.079,length(frac(starGrid)-.50))) * step(.80,noise);
                    float2 moon = skyPosition-float2(-4.63,6.32);
                    float disc = 1-smoothstep(.29,.32,length(moon));
                    float crescent = disc * smoothstep(.27,.31,length(moon-float2(.14,.09)));
                    night += star*.48;
                    night = lerp(night,fixed3(.92,.92,.81),crescent);
                    return fixed4(night,1);
                }
                if (_TimeOfDay > .5)
                {
                    sky = lerp(fixed3(.70,.85,.90),fixed3(.30,.61,.83),height);
                    return fixed4(sky,1);
                }
                float distanceToSun = length((skyPosition-float2(-6.05,4.15))*float2(1,1.07));
                float halo = 1-smoothstep(.30,2.8,distanceToSun);
                float solarDisc = 1-smoothstep(.41,.44,distanceToSun);
                sky = lerp(sky,fixed3(1,.75,.46),halo*.47);
                sky = lerp(sky,fixed3(1,.92,.70),solarDisc);
                return fixed4(sky,1);
            }
            ENDCG
        }
    }
}
