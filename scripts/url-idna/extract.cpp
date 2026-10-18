#include "ada.cpp"
#include <iostream>
int main(){
using namespace ada::idna;
if(!ensure_tables())return 1;
std::cout<<"{\"mapping\":[";
uint16_t last=idna_lookup(0);unsigned start=0;
bool first=true;
for(unsigned c=1;c<=0x110000;c++){uint16_t v=c==0x110000?0:idna_lookup(c);if(v!=last || c==0x110000){if(!first)std::cout<<","; first=false;std::cout<<"["<<start<<","<<c-1<<","<<last<<"]"; start=c;last=v;}}
std::cout<<"],\"strings\":[";
for(size_t i=0;i<idna_utf8_mappings_size;i++){if(i)std::cout<<",";std::cout<<unsigned(idna_utf8_mappings[i]);}
std::cout<<"],\"directions\":[";for(size_t i=0;i<dir_table_count;i++){if(i)std::cout<<",";std::cout<<"["<<dir_start[i]<<","<<dir_final[i]<<","<<unsigned(dir_value[i])<<"]";}
std::cout<<"],\"combining\":[";for(size_t i=0;i<combining_range_count;i++){if(i)std::cout<<",";std::cout<<"["<<combining_ranges[i][0]<<","<<combining_ranges[i][1]<<"]";}
std::cout<<"],\"valid\":"<<IDNA_VALID<<",\"disallowed\":"<<IDNA_DISALLOWED<<"}";
}
