Shader "WorstDateEver/BedroomMirror"
{
    Properties
    {
        _Reflection ("Reflection", 2D) = "gray" {}
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            sampler2D _Reflection;

            struct appdata
            {
                float4 vertex : POSITION;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float4 projected : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert(appdata input)
            {
                v2f output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.position = UnityObjectToClipPos(input.vertex);
                output.projected = ComputeNonStereoScreenPos(output.position);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                fixed3 reflection = tex2Dproj(_Reflection, UNITY_PROJ_COORD(input.projected)).rgb;
                return fixed4(reflection * fixed3(.94,.95,.94) + fixed3(.02,.024,.028), 1);
            }
            ENDCG
        }
    }
}
